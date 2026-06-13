/**
 * 电脑出价策略（人机模式）—— 启发式：用自己手牌 + 概率估计场上某点数总数，
 * 叫得过头就开，否则做最小合法加叫。带一点随机（虚张/保守）增加变化。
 * 纯飞局（localGame 已禁斋/扩展），逻辑保持简单。Math.random 在 app 代码可用。
 */
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate'
import type { Bid, Face, RoomState } from '@/lib/game-engine/types'
import type { Hands } from '@/lib/game-engine/round'

export type BotAction = { type: 'bid'; bid: Bid } | { type: 'challenge' }
export type Difficulty = 'easy' | 'medium' | 'hard'

// 难度参数：noise=对期望的误判幅度（越大越蠢）；chMul=开牌倾向乘子（越小越容易硬撑被抓）；
// bluff=低期望时仍敢大叫的概率（虚张）。
const CFG: Record<Difficulty, { noise: number; chMul: number; bluff: number }> = {
  easy: { noise: 1.3, chMul: 0.5, bluff: 0 },
  medium: { noise: 0.5, chMul: 1.0, bluff: 0.06 },
  hard: { noise: 0.15, chMul: 1.2, bluff: 0.14 },
}

/** 自己手牌里匹配某点数的个数（含万能 1）。 */
function countOwn(hand: number[], face: number, wild: boolean): number {
  let n = 0
  for (const f of hand) {
    if (f === face) n++
    else if (wild && f === 1) n++
  }
  return n
}

/** 手牌里出现最多的非 1 点数（开局用）。 */
function bestFace(hand: number[]): { face: Face; own: number } {
  const counts = new Map<number, number>()
  for (const f of hand) if (f !== 1) counts.set(f, (counts.get(f) ?? 0) + 1)
  let face = 2
  let own = -1
  for (const [f, c] of counts) if (c > own) { face = f; own = c }
  return { face: face as Face, own: Math.max(0, own) }
}

export function botAct(state: RoomState, hands: Hands, botId: string, difficulty: Difficulty = 'medium'): BotAction {
  const cfg = CFG[difficulty]
  const hand = hands[botId] ?? []
  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0)
  const aliveCount = state.players.filter((p) => p.alive).length
  const others = Math.max(0, totalDice - hand.length)
  const noise = () => (Math.random() * 2 - 1) * cfg.noise

  if (!state.lastBid) {
    // 开局：以自己最多的点数起叫，叫数≈期望（带难度噪声）
    const { face, own } = bestFace(hand)
    const p = state.rules.aceWild ? 2 / 6 : 1 / 6
    const est = own + others * p + noise()
    const floor = getStartingBidThreshold(aliveCount, false, state.rules, totalDice)
    const count = Math.min(totalDice, Math.max(floor, Math.round(est)))
    return { type: 'bid', bid: { count, face, isZhai: false } }
  }

  const bid = state.lastBid
  const wild = state.rules.aceWild && !bid.isZhai && !state.palificoActive
  const own = countOwn(hand, bid.face, wild)
  const p = wild ? 2 / 6 : 1 / 6
  const est = own + others * p // 期望总数
  const slack = bid.count - (est + noise()) // >0 = 叫得偏高（带误判）

  // 叫得越离谱越倾向开；接近期望就加叫；难度调节开牌倾向
  const baseProb = slack > 2 ? 0.92 : slack > 1 ? 0.55 : slack > 0 ? 0.2 : 0.04
  if (bid.count >= totalDice || Math.random() < baseProb * cfg.chMul) return { type: 'challenge' }

  // 加叫：通常 count+1 同点 / 同 count 升点；虚张时直接跳叫 +2
  const bluffing = Math.random() < cfg.bluff
  const candidates: Bid[] = [
    ...(bluffing ? [{ count: bid.count + 2, face: bid.face, isZhai: false }] : []),
    { count: bid.count + 1, face: bid.face, isZhai: false },
    ...(bid.face < state.rules.diceSides
      ? [{ count: bid.count, face: (bid.face + 1) as Face, isZhai: false }]
      : []),
  ]
  for (const c of candidates) {
    if (isValidBid(bid, c, state.rules, aliveCount, { totalDice, palifico: state.palificoActive }).ok) {
      return { type: 'bid', bid: c }
    }
  }
  return { type: 'challenge' }
}
