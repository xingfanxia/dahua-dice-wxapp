/**
 * 本地单机对局驱动（人机模式）—— 复用引擎纯函数（resolveChallenge/prepareNextRound）+
 * 本地复刻 placeBid 推进。单机无协议对手，客户端 roll 合规（铁律 4 只约束多人）。
 * 规则刻意精简：飞 + 开，不含劈/通杀/Palifico/斋（保持 bot 策略简单清晰）。
 */
import { prepareNextRound, resolveChallenge, type Hands } from '@/lib/game-engine/round'
import { DEFAULT_RULES, type Bid, type GameRules, type RoomState } from '@/lib/game-engine/types'
import { rollDiceClient } from '@/lib/soloRoll'

export type LocalGame = { state: RoomState; hands: Hands }

export function createLocalGame(botCount: number, diceCount: number): RoomState {
  const players = [
    { id: 'me', nick: '你', avatar: '', diceLeft: diceCount, alive: true },
    ...Array.from({ length: botCount }, (_, i) => ({
      id: `bot${i + 1}`,
      nick: `电脑${i + 1}`,
      avatar: '',
      diceLeft: diceCount,
      alive: true,
    })),
  ]
  return {
    code: 'LOCAL',
    phase: 'lobby',
    players,
    ownerId: 'me',
    currentTurnIdx: 0,
    lastBid: null,
    bidChain: [],
    isZhaiRound: false,
    round: 0,
    rules: {
      ...DEFAULT_RULES,
      diceCount: diceCount as GameRules['diceCount'],
      allowZhai: false,
      chineseExtensions: { pi: false, fanpi: false, tongsha: false },
      paliFicoVariant: false,
    },
    theme: 'default',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
    lastChallengeResult: null,
  }
}

function deal(state: RoomState): Hands {
  const h: Hands = {}
  for (const p of state.players) if (p.alive) h[p.id] = rollDiceClient(p.diceLeft, state.rules.diceSides)
  return h
}

/** lobby/game_end → 开新一局（发牌、进 bidding）。 */
export function startLocal(state: RoomState): LocalGame {
  const next: RoomState = {
    ...state,
    players: state.players.map((p) => ({ ...p, diceLeft: state.rules.diceCount, alive: true })),
    phase: 'bidding',
    round: state.round + 1,
    currentTurnIdx: 0,
    lastBid: null,
    bidChain: [],
    isZhaiRound: false,
    lastChallengeResult: null,
    version: state.version + 1,
  }
  return { state: next, hands: deal(next) }
}

/** 复刻 cloud placeBid：追加链、推进到下一个活人。调用方先用 isValidBid 校验。 */
export function placeBidLocal(state: RoomState, playerId: string, bid: Bid): RoomState {
  const bidChain = state.lastBid == null ? [] : [...state.bidChain]
  bidChain.push({ playerId, bid: { ...bid } })
  const n = state.players.length
  let nextIdx = state.currentTurnIdx
  let guard = 0
  do {
    nextIdx = (nextIdx + 1) % n
    if (++guard > n) break
  } while (!state.players[nextIdx].alive)
  return {
    ...state,
    lastBid: bid,
    bidChain,
    isZhaiRound: state.isZhaiRound || bid.isZhai,
    currentTurnIdx: nextIdx,
    version: state.version + 1,
  }
}

/** 开牌（reveal）。 */
export function challengeLocal(state: RoomState, hands: Hands, challengerId: string): RoomState {
  const r = resolveChallenge(state, hands, challengerId)
  return r.ok ? r.state : state
}

/** reveal → 下一局发牌 / game_end。 */
export function nextRoundLocal(state: RoomState): LocalGame {
  const r = prepareNextRound(state)
  if (!r.ok || !r.state) return { state, hands: {} }
  if (r.state.phase === 'game_end') return { state: r.state, hands: {} }
  return { state: r.state, hands: deal(r.state) }
}
