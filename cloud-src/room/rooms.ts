/**
 * 房间 mutation 实现 —— 语义逐条移植自 web 版 lib/lua/scripts.ts + app/api/action/route.ts。
 *
 * 原子性等价替换：web 版的 Lua 单脚本原子执行，这里用「读 → 纯函数计算新状态 → version-CAS
 * 整体覆写」实现；服务端自身的读写窗口用重试循环兜底（≤4 次，铁律 7），客户端语义动作
 * （bid/开/劈/通杀/nextRound）则 CAS 在客户端送的 expectedVersion 上、失败回 stale 让客户端 resync。
 * PUBLISH 事件通道整体砍掉 —— db.watch 直接监听 rooms 文档（设计 §2）。
 */
import type { Hands } from '@/lib/game-engine/round';
import {
  prepareNextRound,
  resolveChallenge,
  resolvePi,
  resolveTongsha,
} from '@/lib/game-engine/round';
import type { ChallengeOutcome, Face, GameRules, RoomState } from '@/lib/game-engine/types';
import { DEFAULT_RULES } from '@/lib/game-engine/types';
import { isValidBid } from '@/lib/game-engine/validate';
import type { RoomDb, RoomDoc } from './db';
import { generateInviteCode, isValidInviteCode, rollDice } from './rng';
import type { ParsedAction } from './schemas';
import { normalizeAvatarUrl, validateNickname } from './schemas';
import { recordResolution, recordGameEnd } from './stats';

export type ActionResult = {
  ok: boolean;
  reason?: string;
  version?: number;
  [k: string]: unknown;
};

const MAX_PLAYERS = 8;
const CAS_RETRIES = 4;

/** web 版 normalizeState 的移植：兼容旧文档缺字段（文档库无 cjson {} 问题，但保持同一防御面） */
export function normalizeState<T extends RoomState>(state: T): T {
  return {
    ...state,
    bidChain: Array.isArray(state.bidChain) ? state.bidChain : [],
    palificoActive: state.palificoActive ?? false,
    palificoBidderId: state.palificoBidderId ?? null,
    palificoTriggered: Array.isArray(state.palificoTriggered) ? state.palificoTriggered : [],
  };
}

/** 服务端自身读写窗口的 CAS 重试循环（join/leave/setAvatar/updateRules/rematch 用） */
async function mutateWithRetry(
  db: RoomDb,
  code: string,
  fn: (state: RoomDoc) => { ok: false; reason: string } | { ok: true; doc: RoomDoc; extra?: Record<string, unknown> },
): Promise<ActionResult> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const state = await db.getRoom(code);
    if (!state) return { ok: false, reason: 'no_room' };
    const r = fn(normalizeState(state));
    if (!r.ok) return r;
    if (await db.casUpdateRoom(code, state.version, r.doc)) {
      return { ok: true, version: r.doc.version, ...r.extra };
    }
  }
  return { ok: false, reason: 'stale' };
}

// ---------- create ----------

export async function createRoom(
  db: RoomDb,
  openid: string,
  input: { nick?: unknown; avatarUrl?: unknown },
): Promise<ActionResult> {
  const v = validateNickname(input.nick);
  if (!v.ok) return { ok: false, reason: v.reason };
  const avatarUrl = normalizeAvatarUrl(input.avatarUrl);

  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const doc: RoomDoc = {
      code,
      phase: 'lobby',
      players: [{ id: openid, nick: v.value, avatar: avatarUrl, diceLeft: DEFAULT_RULES.diceCount, alive: true }],
      ownerId: openid,
      currentTurnIdx: 0,
      lastBid: null,
      bidChain: [],
      isZhaiRound: false,
      round: 0,
      rules: DEFAULT_RULES,
      theme: 'default',
      version: 1,
      createdAt: Date.now(),
      palificoActive: false,
      palificoBidderId: null,
      palificoTriggered: [],
      lastChallengeResult: null,
      revealedHands: null,
      updatedAt: Date.now(),
    };
    if (await db.createRoom(code, doc)) return { ok: true, code, version: 1 };
  }
  return { ok: false, reason: 'code_collision' };
}

// ---------- get ----------

export async function getRoom(db: RoomDb, code: string): Promise<ActionResult> {
  if (!isValidInviteCode(code.toUpperCase())) return { ok: false, reason: 'invalid_code' };
  const state = await db.getRoom(code.toUpperCase());
  if (!state) return { ok: false, reason: 'no_room' };
  return { ok: true, state: normalizeState(state), version: state.version };
}

export async function getMyHand(db: RoomDb, code: string, openid: string): Promise<ActionResult> {
  if (!isValidInviteCode(code.toUpperCase())) return { ok: false, reason: 'invalid_code' };
  const hand = await db.getMyHand(code.toUpperCase(), openid);
  if (!hand) return { ok: false, reason: 'no_hand' };
  return { ok: true, round: hand.round, dice: hand.dice };
}

// ---------- act ----------

export async function act(db: RoomDb, openid: string, action: ParsedAction): Promise<ActionResult> {
  if (!isValidInviteCode(action.code.toUpperCase())) return { ok: false, reason: 'invalid_code' };
  const code = action.code.toUpperCase();

  switch (action.type) {
    case 'join':
      return join(db, code, openid, action.nick, action.avatarUrl);
    case 'start':
      return start(db, code, openid);
    case 'bid':
      return bid(db, code, openid, action.count, action.face as Face, action.isZhai, action.expectedVersion);
    case 'challenge':
    case 'pi':
    case 'tongsha':
      return resolve(db, code, openid, action);
    case 'nextRound':
      return nextRound(db, code, openid, action.expectedVersion);
    case 'leave':
      return leave(db, code, openid);
    case 'setAvatar':
      return setAvatar(db, code, openid, action.avatarUrl);
    case 'updateRules':
      return updateRules(db, code, openid, action.rules);
    case 'rematch':
      return rematch(db, code, openid);
  }
}

/** joinRoom Lua 移植：lobby-only、≤8 人、重复 join = 刷新资料（rejoined） */
async function join(db: RoomDb, code: string, openid: string, nickRaw: string, avatarRaw?: string): Promise<ActionResult> {
  const v = validateNickname(nickRaw);
  if (!v.ok) return { ok: false, reason: v.reason };
  const avatarUrl = normalizeAvatarUrl(avatarRaw);

  return mutateWithRetry(db, code, (state) => {
    if (state.phase === 'game_end') return { ok: false, reason: 'game_ended' };
    if (state.phase !== 'lobby') return { ok: false, reason: 'game_in_progress' };
    const existing = state.players.findIndex((p) => p.id === openid);
    if (existing >= 0) {
      const players = state.players.map((p, i) =>
        i === existing ? { ...p, nick: v.value, avatar: avatarUrl } : p,
      );
      return { ok: true, doc: { ...state, players, version: state.version + 1 }, extra: { rejoined: true } };
    }
    if (state.players.length >= MAX_PLAYERS) return { ok: false, reason: 'room_full' };
    const players = [
      ...state.players,
      { id: openid, nick: v.value, avatar: avatarUrl, diceLeft: state.rules.diceCount, alive: true },
    ];
    return { ok: true, doc: { ...state, players, version: state.version + 1 } };
  });
}

/**
 * startGame 移植。CAS 基于**服务端自己读的 version**（不是客户端送的）+ stale 自动重试 ≤4 ——
 * web 版 TOCTOU 教训（铁律 7）：读→写窗口里落进来的 join/改规则会让手牌对应过期 roster。
 * 手牌先写（_id 幂等可覆写），房间 CAS 后置作为提交点。
 */
async function start(db: RoomDb, code: string, openid: string): Promise<ActionResult> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const raw = await db.getRoom(code);
    if (!raw) return { ok: false, reason: 'no_room' };
    const state = normalizeState(raw);
    if (state.ownerId !== openid) return { ok: false, reason: 'not_owner' };
    if (state.phase !== 'lobby') return { ok: false, reason: 'wrong_phase' };
    if (state.players.length < 2) return { ok: false, reason: 'need_more_players' };

    const hands: Hands = {};
    for (const p of state.players) {
      if (!p.alive) continue;
      hands[p.id] = rollDice(p.diceLeft, state.rules.diceSides);
    }
    const round = state.round + 1;
    await db.setHands(code, round, hands);

    const players = [...state.players];
    let currentTurnIdx = 0;
    if (!players[0].alive) {
      for (let k = 0; k < players.length; k++) {
        currentTurnIdx = (currentTurnIdx + 1) % players.length;
        if (players[currentTurnIdx].alive) break;
      }
    }
    const doc: RoomDoc = {
      ...state,
      phase: 'bidding',
      round,
      currentTurnIdx,
      lastBid: null,
      bidChain: [],
      isZhaiRound: false,
      lastChallengeResult: null,
      revealedHands: null,
      version: state.version + 1,
    };
    if (await db.casUpdateRoom(code, state.version, doc)) return { ok: true, version: doc.version };
    // stale：roster 在读写窗口里动了 —— 重读重 roll
  }
  return { ok: false, reason: 'stale' };
}

/** placeBid 移植：校验绑定在将要 CAS 的 version 上（web 版 bid TOCTOU 修复语义） */
async function bid(
  db: RoomDb,
  code: string,
  openid: string,
  count: number,
  face: Face,
  isZhai: boolean,
  expectedVersion: number,
): Promise<ActionResult> {
  const raw = await db.getRoom(code);
  if (!raw) return { ok: false, reason: 'no_room' };
  const state = normalizeState(raw);
  if (state.version !== expectedVersion) {
    return { ok: false, reason: 'stale', currentVersion: state.version };
  }
  if (state.phase !== 'bidding') return { ok: false, reason: 'wrong_phase' };
  const turnPlayer = state.players[state.currentTurnIdx];
  if (!turnPlayer || turnPlayer.id !== openid) return { ok: false, reason: 'not_your_turn' };

  const alive = state.players.filter((p) => p.alive).length;
  const totalDice = state.players.reduce((sum, p) => sum + (p.alive ? p.diceLeft : 0), 0);
  const validation = isValidBid(state.lastBid, { count, face, isZhai }, state.rules, alive, {
    totalDice,
    palifico: state.palificoActive,
  });
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const bidObj = { count, face, isZhai };
  const bidChain = state.lastBid == null ? [] : [...state.bidChain];
  bidChain.push({ playerId: openid, bid: { ...bidObj } });

  const n = state.players.length;
  let nextIdx = state.currentTurnIdx;
  let guard = 0;
  do {
    nextIdx = (nextIdx + 1) % n;
    if (++guard > n) return { ok: false, reason: 'no_alive_players' };
  } while (!state.players[nextIdx].alive);

  const doc: RoomDoc = {
    ...state,
    lastBid: bidObj,
    bidChain,
    isZhaiRound: state.isZhaiRound || isZhai,
    currentTurnIdx: nextIdx,
    version: state.version + 1,
  };
  if (await db.casUpdateRoom(code, expectedVersion, doc)) return { ok: true, version: doc.version };
  const cur = await db.getRoom(code);
  return { ok: false, reason: 'stale', currentVersion: cur?.version };
}

/** challenge/pi/tongsha：引擎解算 + commitState CAS 移植；揭晓手牌随同一次 CAS 写进文档（公开时刻） */
async function resolve(
  db: RoomDb,
  code: string,
  openid: string,
  action: Extract<ParsedAction, { type: 'challenge' | 'pi' | 'tongsha' }>,
): Promise<ActionResult> {
  const raw = await db.getRoom(code);
  if (!raw) return { ok: false, reason: 'no_room' };
  const state = normalizeState(raw);
  if (state.version !== action.expectedVersion) {
    return { ok: false, reason: 'stale', currentVersion: state.version };
  }
  const hands = await db.getHands(code);
  const r =
    action.type === 'challenge'
      ? resolveChallenge(state, hands, openid)
      : action.type === 'pi'
        ? resolvePi(state, hands, openid, action.targetPlayerId)
        : resolveTongsha(state, hands, openid);
  if (!r.ok) return { ok: false, reason: r.reason };

  const doc: RoomDoc = { ...state, ...r.state, revealedHands: hands, updatedAt: Date.now() };
  if (!(await db.casUpdateRoom(code, state.version, doc))) {
    const cur = await db.getRoom(code);
    return { ok: false, reason: 'stale', currentVersion: cur?.version };
  }
  await recordResolution(db, doc, r.outcome, openid).catch(() => {});
  if (r.state.phase === 'game_end') await recordGameEnd(db, doc).catch(() => {});
  return { ok: true, version: r.state.version };
}

/** nextRound 移植：reveal → 下一轮发牌（commitRound）或 game_end（commitState） */
async function nextRound(db: RoomDb, code: string, openid: string, expectedVersion: number): Promise<ActionResult> {
  const raw = await db.getRoom(code);
  if (!raw) return { ok: false, reason: 'no_room' };
  const state = normalizeState(raw);
  if (!state.players.some((p) => p.id === openid)) return { ok: false, reason: 'not_in_room' };
  if (state.version !== expectedVersion) {
    return { ok: false, reason: 'stale', currentVersion: state.version };
  }
  const r = prepareNextRound(state);
  if (!r.ok || !r.state) return { ok: false, reason: r.reason ?? 'wrong_phase' };

  if (r.state.phase === 'game_end') {
    const doc: RoomDoc = { ...state, ...r.state, revealedHands: state.revealedHands ?? null, updatedAt: Date.now() };
    if (!(await db.casUpdateRoom(code, state.version, doc))) {
      const cur = await db.getRoom(code);
      return { ok: false, reason: 'stale', currentVersion: cur?.version };
    }
    await recordGameEnd(db, doc).catch(() => {});
    return { ok: true, version: doc.version };
  }

  const hands: Hands = {};
  for (const p of r.state.players) {
    if (!p.alive) continue;
    hands[p.id] = rollDice(p.diceLeft, r.state.rules.diceSides);
  }
  await db.setHands(code, r.state.round, hands);
  const doc: RoomDoc = { ...state, ...r.state, revealedHands: null, updatedAt: Date.now() };
  if (!(await db.casUpdateRoom(code, state.version, doc))) {
    const cur = await db.getRoom(code);
    return { ok: false, reason: 'stale', currentVersion: cur?.version };
  }
  return { ok: true, version: doc.version };
}

/** leaveRoom Lua 移植：lobby 移除（空房删房/转房主）；局中标记死亡（剩 1 人则终局） */
async function leave(db: RoomDb, code: string, openid: string): Promise<ActionResult> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const raw = await db.getRoom(code);
    if (!raw) return { ok: false, reason: 'no_room' };
    const state = normalizeState(raw);
    const idx = state.players.findIndex((p) => p.id === openid);
    if (idx === -1) return { ok: true, version: state.version, alreadyOut: true };

    if (state.phase === 'lobby') {
      const players = state.players.filter((p) => p.id !== openid);
      if (players.length === 0) {
        await db.removeRoom(code);
        return { ok: true, roomClosed: true };
      }
      const doc: RoomDoc = {
        ...state,
        players,
        ownerId: state.ownerId === openid ? players[0].id : state.ownerId,
        version: state.version + 1,
      };
      if (await db.casUpdateRoom(code, state.version, doc)) return { ok: true, version: doc.version };
      continue;
    }

    // 局中：标记死亡保位次
    const players = state.players.map((p, i) => (i === idx ? { ...p, alive: false, diceLeft: 0 } : p));
    let ownerId = state.ownerId;
    if (ownerId === openid) {
      const firstAlive = players.find((p) => p.alive);
      if (firstAlive) ownerId = firstAlive.id;
    }
    const aliveCount = players.filter((p) => p.alive).length;
    const lastAliveIdx = players.reduce((acc, p, i) => (p.alive ? i : acc), -1);

    let doc: RoomDoc;
    if (aliveCount <= 1) {
      const outcome: ChallengeOutcome = {
        kind: 'challenge',
        actualCount: 0,
        verifiedBid: { count: 0 as number, face: 1, isZhai: false },
        bidderIdx: -1,
        loserIdx: idx,
        loserId: openid,
        loserIds: [openid],
        diceLost: 0,
        actualMeetsBid: false,
        gameEnded: true,
        winnerIdx: lastAliveIdx,
      };
      doc = { ...state, players, ownerId, phase: 'game_end', lastChallengeResult: outcome, version: state.version + 1 };
    } else {
      let currentTurnIdx = state.currentTurnIdx;
      if (currentTurnIdx === idx) {
        const n = players.length;
        let guard = 0;
        do {
          currentTurnIdx = (currentTurnIdx + 1) % n;
          if (++guard > n) break;
        } while (!players[currentTurnIdx].alive);
      }
      doc = { ...state, players, ownerId, currentTurnIdx, version: state.version + 1 };
    }
    if (await db.casUpdateRoom(code, state.version, doc)) {
      if (doc.phase === 'game_end') await recordGameEnd(db, doc).catch(() => {});
      return { ok: true, version: doc.version };
    }
  }
  return { ok: false, reason: 'stale' };
}

/** setAvatar Lua 移植：lobby-only（局中 bump version 会跟 CAS bid 打架） */
async function setAvatar(db: RoomDb, code: string, openid: string, avatarRaw: string): Promise<ActionResult> {
  const avatarUrl = normalizeAvatarUrl(avatarRaw);
  return mutateWithRetry(db, code, (state) => {
    if (state.phase !== 'lobby') return { ok: false, reason: 'wrong_phase' };
    const idx = state.players.findIndex((p) => p.id === openid);
    if (idx === -1) return { ok: false, reason: 'not_in_room' };
    const players = state.players.map((p, i) => (i === idx ? { ...p, avatar: avatarUrl } : p));
    return { ok: true, doc: { ...state, players, version: state.version + 1 } };
  });
}

/** updateRules Lua 移植：owner-only、lobby-only、同步全员 diceLeft */
async function updateRules(db: RoomDb, code: string, openid: string, rules: GameRules): Promise<ActionResult> {
  return mutateWithRetry(db, code, (state) => {
    if (state.ownerId !== openid) return { ok: false, reason: 'not_owner' };
    if (state.phase !== 'lobby') return { ok: false, reason: 'wrong_phase' };
    const players = state.players.map((p) => ({ ...p, diceLeft: rules.diceCount }));
    return { ok: true, doc: { ...state, rules, players, version: state.version + 1 } };
  });
}

/** rematch Lua 移植：owner-only、game_end-only，整桌满血回大厅 */
async function rematch(db: RoomDb, code: string, openid: string): Promise<ActionResult> {
  const result = await mutateWithRetry(db, code, (state) => {
    if (state.ownerId !== openid) return { ok: false, reason: 'not_owner' };
    if (state.phase !== 'game_end') return { ok: false, reason: 'wrong_phase' };
    const players = state.players.map((p) => ({ ...p, diceLeft: state.rules.diceCount, alive: true }));
    const doc: RoomDoc = {
      ...state,
      players,
      phase: 'lobby',
      round: 0,
      currentTurnIdx: 0,
      lastBid: null,
      bidChain: [],
      isZhaiRound: false,
      palificoActive: false,
      palificoBidderId: null,
      palificoTriggered: [],
      lastChallengeResult: null,
      revealedHands: null,
      version: state.version + 1,
    };
    return { ok: true, doc };
  });
  if (result.ok) await db.removeHands(code).catch(() => {});
  return result;
}
