/** 手牌点数统计行：每个点数计个数（含 1 —— 豹子加成玩家自己算，AX 反馈去掉 (+n) 标注）。 */
export function summarizeHand(hand: number[]): string[] {
  const counts = new Map<number, number>()
  for (const f of hand) counts.set(f, (counts.get(f) ?? 0) + 1)
  return [...counts.keys()].sort((a, b) => a - b).map((f) => `${f} ×${counts.get(f)}`)
}
