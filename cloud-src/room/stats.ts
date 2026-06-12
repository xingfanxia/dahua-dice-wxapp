/**
 * 玩家战绩（设计 §3 StatsDoc，AX 2026-06-12 指示：统计挂微信身份/openid）。
 * 写入只发生在 room 云函数内（单写入口铁律不破例）；按 openid 单写者，读-改-写即可。
 * 失败不致命 —— 调用方 catch 后继续（战绩丢一次 ≪ 游戏动作失败）。
 */
import type { ChallengeOutcome } from '@/lib/game-engine/types';
import type { RoomDb, RoomDoc, StatsDoc } from './db';

function emptyStats(): StatsDoc {
  return {
    nick: '',
    avatarUrl: '',
    gamesPlayed: 0,
    wins: 0,
    challengesWon: 0,
    challengesLost: 0,
    lastPlayedAt: 0,
  };
}

async function bump(db: RoomDb, openid: string, profile: { nick: string; avatarUrl: string }, fn: (s: StatsDoc) => void): Promise<void> {
  const cur = (await db.getStats(openid)) ?? emptyStats();
  const next: StatsDoc = { ...cur, nick: profile.nick, avatarUrl: profile.avatarUrl, lastPlayedAt: Date.now() };
  fn(next);
  await db.setStats(openid, next);
}

/**
 * 每次开/劈/通杀解算后：输家 challengesLost+1；发起方不在输家列表则 challengesWon+1
 * （挑战成功）。粒度刻意粗 —— 这是聚会谈资，不是天梯。
 */
export async function recordResolution(
  db: RoomDb,
  doc: RoomDoc,
  outcome: ChallengeOutcome,
  callerId: string,
): Promise<void> {
  const byId = new Map(doc.players.map((p) => [p.id, p]));
  for (const loserId of outcome.loserIds) {
    const p = byId.get(loserId);
    if (!p) continue;
    await bump(db, loserId, { nick: p.nick, avatarUrl: p.avatar }, (s) => {
      s.challengesLost += 1;
    });
  }
  if (!outcome.loserIds.includes(callerId)) {
    const p = byId.get(callerId);
    if (p) {
      await bump(db, callerId, { nick: p.nick, avatarUrl: p.avatar }, (s) => {
        s.challengesWon += 1;
      });
    }
  }
}

/** game_end：全员 gamesPlayed+1，胜者 wins+1（winnerIdx 来自终局 outcome） */
export async function recordGameEnd(db: RoomDb, doc: RoomDoc): Promise<void> {
  const winnerIdx = doc.lastChallengeResult?.winnerIdx ?? -1;
  const winnerId = winnerIdx >= 0 ? doc.players[winnerIdx]?.id : undefined;
  for (const p of doc.players) {
    await bump(db, p.id, { nick: p.nick, avatarUrl: p.avatar }, (s) => {
      s.gamesPlayed += 1;
      if (p.id === winnerId) s.wins += 1;
    });
  }
}

export async function getStats(db: RoomDb, openid: string): Promise<{ ok: true; stats: StatsDoc }> {
  return { ok: true, stats: (await db.getStats(openid)) ?? emptyStats() };
}
