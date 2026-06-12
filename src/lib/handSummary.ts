/** 手牌点数统计行："3 ×2"；1 万能时非 1 点数标 "(+1的个数)"，全 1 手牌退回 "1 ×n"。 */
export function summarizeHand(hand: number[], aceWild: boolean): string[] {
  const counts = new Map<number, number>()
  for (const f of hand) counts.set(f, (counts.get(f) ?? 0) + 1)
  const ones = counts.get(1) ?? 0
  const faces = [...counts.keys()].sort((a, b) => a - b)
  if (aceWild && ones > 0) {
    const rows = faces.filter((f) => f !== 1).map((f) => `${f} ×${counts.get(f)}(+${ones})`)
    return rows.length > 0 ? rows : [`1 ×${ones}`]
  }
  return faces.map((f) => `${f} ×${counts.get(f)}`)
}
