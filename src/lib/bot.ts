/**
 * 电脑出价策略（人机模式）—— 启发式：用自己手牌 + 概率估计场上某点数总数，
 * 叫得过头就开，否则做最小合法加叫。带一点随机（虚张/保守）增加变化。
 * 纯飞局（localGame 已禁斋/扩展），逻辑保持简单。Math.random 在 app 代码可用。
 */
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate'
import type { Bid, Face, RoomState } from '@/lib/game-engine/types'
import type { Hands } from '@/lib/game-engine/round'

export type BotAction = { type: 'bid'; bid: Bid } | { type: 'challenge' }

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

export function botAct(state: RoomState, hands: Hands, botId: string): BotAction {
  const hand = hands[botId] ?? []
  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0)
  const aliveCount = state.players.filter((p) => p.alive).length
  const others = Math.max(0, totalDice - hand.length)

  if (!state.lastBid) {
    // 开局：以自己最多的点数起叫，叫数≈期望
    const { face, own } = bestFace(hand)
    const p = state.rules.aceWild ? 2 / 6 : 1 / 6
    const est = own + others * p
    const floor = getStartingBidThreshold(aliveCount, false, state.rules, totalDice)
    const count = Math.min(totalDice, Math.max(floor, Math.round(est)))
    return { type: 'bid', bid: { count, face, isZhai: false } }
  }

  const bid = state.lastBid
  const wild = state.rules.aceWild && !bid.isZhai && !state.palificoActive
  const own = countOwn(hand, bid.face, wild)
  const p = wild ? 2 / 6 : 1 / 6
  const est = own + others * p // 期望总数
  const slack = bid.count - est // >0 = 叫得偏高

  // 叫得越离谱越倾向开；接近期望就加叫；偶尔虚张
  const challengeProb = slack > 2 ? 0.92 : slack > 1 ? 0.55 : slack > 0 ? 0.2 : 0.04
  if (bid.count >= totalDice || Math.random() < challengeProb) return { type: 'challenge' }

  // 加叫：优先 count+1 同点，其次同 count 升点；都不行就开
  const candidates: Bid[] = [
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
