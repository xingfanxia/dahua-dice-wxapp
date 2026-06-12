/**
 * RoomDb — 云数据库访问层抽象。
 *
 * 注入式设计（测试传 fake，运行时传 wx-server-sdk 实现）：vitest 用 tests/cloud/fake-db.ts
 * 在本地离线跑全部 action 序列与 CAS 冲突场景，不需要云环境。
 *
 * CAS 语义：casUpdateRoom 仅当 `_id=code 且 version=expectedVersion` 命中时整体覆写
 * （所有字段 _.set 强制替换，避免文档库的嵌套 merge 语义吞掉数组/对象收缩），
 * 返回是否真的写入 —— 等价于 web 版 Lua 脚本的原子 GET-检查-SET。
 */
import type { Hands } from '@/lib/game-engine/round';
import type { RoomState } from '@/lib/game-engine/types';

/** rooms 集合文档 = 引擎 RoomState + 文档库附加字段 */
export type RoomDoc = RoomState & {
  /** 揭晓后全员手牌（resolve 时写入，nextRound/rematch 清空）。未揭晓手牌永不进本文档（铁律 8）。 */
  revealedHands?: Hands | null;
  updatedAt: number;
};

export type HandDoc = {
  /** 拥有者 openid（服务端写入需显式存，安全规则用 doc.openid == auth.openid） */
  openid: string;
  roomCode: string;
  round: number;
  dice: number[];
  updatedAt: number;
};

export type StatsDoc = {
  nick: string;
  avatarUrl: string;
  gamesPlayed: number;
  wins: number;
  challengesWon: number;
  challengesLost: number;
  lastPlayedAt: number;
};

export interface RoomDb {
  getRoom(code: string): Promise<RoomDoc | null>;
  /** 仅当房间码未被占用时创建；被占用返回 false */
  createRoom(code: string, doc: RoomDoc): Promise<boolean>;
  /** version-CAS 整体覆写；命中返回 true */
  casUpdateRoom(code: string, expectedVersion: number, doc: RoomDoc): Promise<boolean>;
  removeRoom(code: string): Promise<void>;
  /** 写入/覆写一批手牌文档（_id = `${code}_${openid}`，天然幂等） */
  setHands(code: string, round: number, hands: Hands): Promise<void>;
  getHands(code: string): Promise<Hands>;
  getMyHand(code: string, openid: string): Promise<HandDoc | null>;
  removeHands(code: string): Promise<void>;
  getStats(openid: string): Promise<StatsDoc | null>;
  /** 读-改-写 upsert（战绩按 openid 单写者，无并发面） */
  setStats(openid: string, doc: StatsDoc): Promise<void>;
  /** cleanup 哨兵（rooms 集合 _id='__cleanup__'）：lastRunAt，不存在为 0 */
  getCleanupMark(): Promise<number>;
  /** CAS 抢哨兵：lastRunAt 仍为 expected 时更新为 now，抢到返回 true */
  claimCleanupMark(expected: number, now: number): Promise<boolean>;
  /** 删除 updatedAt < cutoff 的 rooms/hands（哨兵文档除外） */
  removeExpired(cutoff: number): Promise<{ rooms: number; hands: number }>;
}

const now = () => Date.now();

/** wx-server-sdk 实现。`db` 为 cloud.database() 实例（any：wx-server-sdk 无类型包） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wxRoomDb(db: any): RoomDb {
  const _ = db.command;
  const rooms = db.collection('rooms');
  const hands = db.collection('hands');
  const stats = db.collection('stats');

  /** 写路径懒建集合：首次写到不存在的集合 → createCollection → 重试一次（免去人肉 init 步骤） */
  const withEnsure = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isCollectionMissing(err)) throw err;
      await db.createCollection(name).catch(() => {}); // 并发建同名集合 → 忽略已存在
      return fn();
    }
  };

  /** 全字段 _.set：文档库 update 对嵌套对象默认 merge，会把数组收缩/字段删除吞掉 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setAll = (doc: Record<string, any>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (k === '_id') continue;
      out[k] = _.set(v === undefined ? null : v);
    }
    return out;
  };

  return {
    async getRoom(code) {
      try {
        const res = await rooms.doc(code).get();
        if (!res.data) return null;
        const { _id, ...rest } = res.data;
        return rest as RoomDoc;
      } catch (err: unknown) {
        // doc 不存在：wx-server-sdk 抛 DOCUMENT_NOT_FOUND / -502004 系错误码
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async createRoom(code, doc) {
      try {
        await withEnsure('rooms', () => rooms.add({ data: { _id: code, ...doc, updatedAt: now() } }));
        return true;
      } catch (err: unknown) {
        if (isDuplicate(err)) return false;
        throw err;
      }
    },
    async casUpdateRoom(code, expectedVersion, doc) {
      const res = await rooms
        .where({ _id: code, version: expectedVersion })
        .update({ data: setAll({ ...doc, updatedAt: now() }) });
      return (res.stats?.updated ?? 0) > 0;
    },
    async removeRoom(code) {
      await rooms.doc(code).remove().catch(() => {});
      await hands.where({ roomCode: code }).remove().catch(() => {});
    },
    async setHands(code, round, handsMap) {
      const t = now();
      await withEnsure('hands', () =>
        Promise.all(
          Object.entries(handsMap).map(([openid, dice]) =>
            hands.doc(`${code}_${openid}`).set({
              data: { openid, roomCode: code, round, dice, updatedAt: t },
            }),
          ),
        ),
      );
    },
    async getHands(code) {
      const res = await hands.where({ roomCode: code }).get();
      const out: Hands = {};
      for (const d of res.data ?? []) out[d.openid] = d.dice ?? [];
      return out;
    },
    async getMyHand(code, openid) {
      try {
        const res = await hands.doc(`${code}_${openid}`).get();
        return (res.data as HandDoc) ?? null;
      } catch (err: unknown) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async removeHands(code) {
      await hands.where({ roomCode: code }).remove().catch(() => {});
    },
    async getStats(openid) {
      try {
        const res = await stats.doc(openid).get();
        return (res.data as StatsDoc) ?? null;
      } catch (err: unknown) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async setStats(openid, doc) {
      await withEnsure('stats', () => stats.doc(openid).set({ data: doc }));
    },
    async getCleanupMark() {
      try {
        const res = await rooms.doc('__cleanup__').get();
        return res.data?.lastRunAt ?? 0;
      } catch (err: unknown) {
        if (isNotFound(err) || isCollectionMissing(err)) return 0;
        throw err;
      }
    },
    async claimCleanupMark(expected, ts) {
      if (expected === 0) {
        try {
          await withEnsure('rooms', () =>
            rooms.add({ data: { _id: '__cleanup__', lastRunAt: ts, updatedAt: ts } }),
          );
          return true;
        } catch (err: unknown) {
          if (!isDuplicate(err)) throw err;
          // 哨兵已存在但 lastRunAt 仍是 0（并发首跑）→ 退回 CAS
        }
      }
      const res = await rooms
        .where({ _id: '__cleanup__', lastRunAt: expected })
        .update({ data: { lastRunAt: _.set(ts), updatedAt: _.set(ts) } });
      return (res.stats?.updated ?? 0) > 0;
    },
    async removeExpired(cutoff) {
      // 哨兵自身 claim 时刚刷过 updatedAt，天然不会被删
      const r1 = await rooms.where({ updatedAt: _.lt(cutoff) }).remove().catch(() => null);
      const r2 = await hands.where({ updatedAt: _.lt(cutoff) }).remove().catch(() => null);
      return { rooms: r1?.stats?.removed ?? 0, hands: r2?.stats?.removed ?? 0 };
    },
  };
}

function errCode(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  return String(e?.errCode ?? e?.code ?? e?.message ?? '');
}
function isCollectionMissing(err: unknown): boolean {
  const c = errCode(err);
  return c.includes('-502005') || c.toUpperCase().includes('COLLECTION_NOT_EXIST') || c.includes('collection not exists');
}
function isNotFound(err: unknown): boolean {
  const c = errCode(err);
  return c.includes('-502004') || c.toUpperCase().includes('DOCUMENT_NOT_FOUND') || c.includes('does not exist');
}
function isDuplicate(err: unknown): boolean {
  const c = errCode(err);
  return c.includes('-502001') || c.toUpperCase().includes('DUPLICATE') || c.includes('already exists');
}
