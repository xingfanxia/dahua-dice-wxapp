/**
 * room 云函数入口 —— 唯一写入口（铁律 7）。
 * event = { op: 'create'|'get'|'hand'|'act'|'stats'|'cleanup'|'echo'|'init', ... }
 * 身份一律取 getWXContext().OPENID，永不信客户端送的 id。
 */
import { cleanup } from './cleanup';
import type { RoomDb } from './db';
import { act, createRoom, getMyHand, getRoom } from './rooms';
import { actionSchema } from './schemas';
import { getStats } from './stats';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatch(db: RoomDb, openid: string, event: any): Promise<unknown> {
  const op = event?.op ?? event?.action; // 兼容 WXAPP-1 echo 冒烟的 {action:'echo'}
  switch (op) {
    case 'echo':
      return { ok: true, echo: event?.payload ?? null, openid };
    case 'create':
      return createRoom(db, openid, { nick: event?.nick, avatarUrl: event?.avatarUrl });
    case 'get':
      return typeof event?.code === 'string' ? getRoom(db, event.code) : { ok: false, reason: 'invalid_code' };
    case 'hand':
      return typeof event?.code === 'string' ? getMyHand(db, event.code, openid) : { ok: false, reason: 'invalid_code' };
    case 'act': {
      const parsed = actionSchema.safeParse(event?.action ?? event?.payload);
      if (!parsed.success) return { ok: false, reason: 'invalid_request' };
      return act(db, openid, parsed.data);
    }
    case 'stats':
      return getStats(db, openid);
    case 'cleanup':
      // 自节流（≥6h 才真跑）；客户端首页 onShow 顺手调，替代定时触发器（ci 无法创建新函数）
      return cleanup(db);
    default:
      return { ok: false, reason: `unknown op: ${String(op)}` };
  }
}
