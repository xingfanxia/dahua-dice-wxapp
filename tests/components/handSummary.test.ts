import { describe, expect, it } from 'vitest';
import { summarizeHand } from '../../src/lib/handSummary';

describe('summarizeHand（手牌统计行）', () => {
  it('普通统计', () => {
    expect(summarizeHand([3, 3, 5, 5, 6], false)).toEqual(['3 ×2', '5 ×2', '6 ×1']);
  });
  it('1 万能：非 1 点数标 (+n)，1 不单列', () => {
    expect(summarizeHand([1, 1, 1, 2, 6], true)).toEqual(['2 ×1(+3)', '6 ×1(+3)']);
  });
  it('1 万能但全是 1：退回 1 ×n', () => {
    expect(summarizeHand([1, 1, 1], true)).toEqual(['1 ×3']);
  });
  it('斋局（aceWild=false）：1 单列不加成', () => {
    expect(summarizeHand([1, 1, 2, 6, 6], false)).toEqual(['1 ×2', '2 ×1', '6 ×2']);
  });
});
