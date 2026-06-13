import { describe, expect, it } from 'vitest';
import { botAct } from '../../src/lib/bot';
import { challengeLocal, createLocalGame, nextRoundLocal, placeBidLocal, startLocal } from '../../src/lib/localGame';
import { isValidBid } from '@/lib/game-engine/validate';

/** 全 bot 自走一整局：验证引擎+本地驱动+bot 策略组合无错、能终局、出价全合法。 */
function playOut(botCount: number, diceCount: number) {
  let { state, hands } = startLocal(createLocalGame(botCount, diceCount));
  let guard = 0;
  let illegalBids = 0;
  while (state.phase !== 'game_end' && guard++ < 2000) {
    if (state.phase === 'bidding') {
      const cur = state.players[state.currentTurnIdx];
      const action = botAct(state, hands, cur.id);
      if (action.type === 'challenge') {
        state = challengeLocal(state, hands, cur.id);
      } else {
        const alive = state.players.filter((p) => p.alive).length;
        const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0);
        if (!isValidBid(state.lastBid, action.bid, state.rules, alive, { totalDice, palifico: state.palificoActive }).ok) {
          illegalBids++;
        }
        state = placeBidLocal(state, cur.id, action.bid);
      }
    } else if (state.phase === 'reveal') {
      const r = nextRoundLocal(state);
      state = r.state;
      hands = r.hands;
    }
  }
  return { state, illegalBids, guard };
}

describe('localGame + bot self-play', () => {
  it('2 bots × 3 dice → terminates at game_end, 1 alive, 0 illegal bids', () => {
    for (let trial = 0; trial < 8; trial++) {
      const { state, illegalBids } = playOut(2, 3);
      expect(state.phase).toBe('game_end');
      expect(state.players.filter((p) => p.alive).length).toBe(1);
      expect(illegalBids).toBe(0);
    }
  });

  it('3 bots × 5 dice → terminates, legal throughout', () => {
    const { state, illegalBids } = playOut(3, 5);
    expect(state.phase).toBe('game_end');
    expect(illegalBids).toBe(0);
  });
});
