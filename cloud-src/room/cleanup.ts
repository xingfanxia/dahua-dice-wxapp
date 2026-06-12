/**
 * 过期房间清理（TTL 替代）—— 折叠进 room 函数的自节流 op。
 * 背景：miniprogram-ci 只能更新已存在的云函数（创建新函数要 IDE 手点），独立 cleanup
 * 函数 + 定时触发器走不通；改为客户端首页 onShow 顺手调一次 {op:'cleanup'}，
 * 服务端用 rooms 集合里的 '__cleanup__' 哨兵文档节流到 ≥6 小时一次。
 * （'__cleanup__' 与 6 位房间码字母表不可能冲突；getRoom 只按合法房间码取文档。）
 */
import type { RoomDb } from './db';

const THROTTLE_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanup(
  db: RoomDb,
): Promise<{ ok: true; ran: boolean; removed?: { rooms: number; hands: number } }> {
  const now = Date.now();
  const last = await db.getCleanupMark();
  if (now - last < THROTTLE_MS) return { ok: true, ran: false };
  // CAS 抢哨兵：并发调用只允许一个真正执行
  if (!(await db.claimCleanupMark(last, now))) return { ok: true, ran: false };
  const removed = await db.removeExpired(now - MAX_AGE_MS);
  return { ok: true, ran: true, removed };
}
