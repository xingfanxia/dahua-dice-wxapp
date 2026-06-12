import { describe, expect, it } from 'vitest';
import { summarizeHand } from '../../src/lib/handSummary';

describe('summarizeHand（手牌统计行 —— 纯计数含 1）', () => {
  it('普通统计', () => {
    expect(summarizeHand([3, 3, 5, 5, 6])).toEqual(['3 ×2', '5 ×2', '6 ×1']);
  });
  it('1 也按普通点数计（豹子玩家自己算）', () => {
    expect(summarizeHand([1, 1, 1, 2, 6])).toEqual(['1 ×3', '2 ×1', '6 ×1']);
  });
  it('全同点', () => {
    expect(summarizeHand([4, 4, 4, 4, 4])).toEqual(['4 ×5']);
  });
});
