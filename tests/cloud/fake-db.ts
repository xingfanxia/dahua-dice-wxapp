/**
 * RoomDb 的内存 fake —— 注入给 dispatch/rooms 做离线测试（云函数测试不需要云环境）。
 * 读写都深拷贝，模拟文档库序列化边界（捕获共享引用突变 bug）；
 * casUpdateRoom 严格按 version 命中才覆写，与 wx 实现同语义。
 */
import type { Hands } from '@/lib/game-engine/round';
import type { HandDoc, RoomDb, RoomDoc, StatsDoc } from '../../cloud-src/room/db';

const clone = <T>(v: T): T => structuredClone(v);

export type FakeRoomDb = RoomDb & {
  rooms: Map<string, RoomDoc>;
  hands: Map<string, HandDoc>;
  stats: Map<string, StatsDoc>;
  /** 测试用：直接覆写某房间的手牌为确定值 */
  forceHands(code: string, round: number, hands: Hands): void;
  /** 测试用：直接修改房间文档 */
  forceRoom(code: string, fn: (doc: RoomDoc) => void): void;
};

export function fakeRoomDb(): FakeRoomDb {
  const rooms = new Map<string, RoomDoc>();
  const hands = new Map<string, HandDoc>();
  const stats = new Map<string, StatsDoc>();

  return {
    rooms,
    hands,
    stats,
    forceHands(code, round, handsMap) {
      for (const key of [...hands.keys()]) {
        if (hands.get(key)?.roomCode === code) hands.delete(key);
      }
      for (const [openid, dice] of Object.entries(handsMap)) {
        hands.set(`${code}_${openid}`, { openid, roomCode: code, round, dice: [...dice], updatedAt: Date.now() });
      }
    },
    forceRoom(code, fn) {
      const doc = rooms.get(code);
      if (!doc) throw new Error(`no room ${code}`);
      fn(doc);
    },

    async getRoom(code) {
      const doc = rooms.get(code);
      return doc ? clone(doc) : null;
    },
    async createRoom(code, doc) {
      if (rooms.has(code)) return false;
      rooms.set(code, clone({ ...doc, updatedAt: Date.now() }));
      return true;
    },
    async casUpdateRoom(code, expectedVersion, doc) {
      const cur = rooms.get(code);
      if (!cur || cur.version !== expectedVersion) return false;
      rooms.set(code, clone({ ...doc, updatedAt: Date.now() }));
      return true;
    },
    async removeRoom(code) {
      rooms.delete(code);
      for (const key of [...hands.keys()]) {
        if (hands.get(key)?.roomCode === code) hands.delete(key);
      }
    },
    async setHands(code, round, handsMap) {
      for (const [openid, dice] of Object.entries(handsMap)) {
        hands.set(`${code}_${openid}`, { openid, roomCode: code, round, dice: [...dice], updatedAt: Date.now() });
      }
    },
    async getHands(code) {
      const out: Hands = {};
      for (const doc of hands.values()) {
        if (doc.roomCode === code) out[doc.openid] = [...doc.dice];
      }
      return out;
    },
    async getMyHand(code, openid) {
      const doc = hands.get(`${code}_${openid}`);
      return doc ? clone(doc) : null;
    },
    async removeHands(code) {
      for (const key of [...hands.keys()]) {
        if (hands.get(key)?.roomCode === code) hands.delete(key);
      }
    },
    async getStats(openid) {
      const doc = stats.get(openid);
      return doc ? clone(doc) : null;
    },
    async setStats(openid, doc) {
      stats.set(openid, clone(doc));
    },
  };
}
