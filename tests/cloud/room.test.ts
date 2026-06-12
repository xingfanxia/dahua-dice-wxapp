/**
 * WXAPP-2 verify gate：fake db 注入，跑通 create→join×2→start→bid→开→nextRound→game_end→rematch
 * 全序列 + 并发 bid CAS 冲突只允许一个提交 + 战绩累计（设计 §3 StatsDoc）。
 */
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../cloud-src/room/main';
import { INVITE_CODE_RE } from '../../cloud-src/room/rng';
import { fakeRoomDb } from './fake-db';

const P1 = 'openid-p1';
const P2 = 'openid-p2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

async function createJoined(db = fakeRoomDb()) {
  const created = (await dispatch(db, P1, { op: 'create', nick: '阿鑫' })) as R;
  expect(created.ok).toBe(true);
  const code = created.code as string;
  const joined = (await dispatch(db, P2, {
    op: 'act',
    action: { type: 'join', code, nick: '老王', avatarUrl: 'https://example.com/a.png' },
  })) as R;
  expect(joined.ok).toBe(true);
  return { db, code };
}

async function getState(db: ReturnType<typeof fakeRoomDb>, code: string) {
  const res = (await dispatch(db, P1, { op: 'get', code })) as R;
  expect(res.ok).toBe(true);
  return res.state;
}

describe('create / join', () => {
  it('create: 房间码合法、创建者为房主、version=1', async () => {
    const db = fakeRoomDb();
    const res = (await dispatch(db, P1, { op: 'create', nick: '阿鑫' })) as R;
    expect(res.ok).toBe(true);
    expect(INVITE_CODE_RE.test(res.code)).toBe(true);
    const state = await getState(db, res.code);
    expect(state.ownerId).toBe(P1);
    expect(state.players).toHaveLength(1);
    expect(state.version).toBe(1);
  });

  it('create: 非法昵称被拒', async () => {
    const db = fakeRoomDb();
    expect(((await dispatch(db, P1, { op: 'create', nick: '' })) as R).reason).toBe('empty');
    expect(((await dispatch(db, P1, { op: 'create', nick: 'a<b>' })) as R).reason).toBe('invalid_chars');
  });

  it('join: 入座 + 重复 join = 刷新资料（rejoined）', async () => {
    const { db, code } = await createJoined();
    const state = await getState(db, code);
    expect(state.players.map((p: R) => p.id)).toEqual([P1, P2]);

    const rejoin = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'join', code, nick: '老王二号', avatarUrl: '' },
    })) as R;
    expect(rejoin.ok).toBe(true);
    expect(rejoin.rejoined).toBe(true);
    const after = await getState(db, code);
    expect(after.players).toHaveLength(2);
    expect(after.players[1].nick).toBe('老王二号');
  });

  it('join: 满 8 人拒绝', async () => {
    const { db, code } = await createJoined();
    for (let i = 3; i <= 8; i++) {
      const r = (await dispatch(db, `openid-p${i}`, {
        op: 'act',
        action: { type: 'join', code, nick: `玩家${i}` },
      })) as R;
      expect(r.ok).toBe(true);
    }
    const ninth = (await dispatch(db, 'openid-p9', {
      op: 'act',
      action: { type: 'join', code, nick: '挤不进' },
    })) as R;
    expect(ninth.reason).toBe('room_full');
  });

  it('join: 不存在的房间 → no_room', async () => {
    const db = fakeRoomDb();
    const r = (await dispatch(db, P1, { op: 'act', action: { type: 'join', code: 'ABCDEF', nick: 'x' } })) as R;
    expect(r.reason).toBe('no_room');
  });
});

describe('start', () => {
  it('非房主/单人/重复 start 被拒；正常 start 发牌进 bidding', async () => {
    const db = fakeRoomDb();
    const created = (await dispatch(db, P1, { op: 'create', nick: '阿鑫' })) as R;
    const code = created.code;

    expect(((await dispatch(db, P1, { op: 'act', action: { type: 'start', code } })) as R).reason).toBe(
      'need_more_players',
    );
    await dispatch(db, P2, { op: 'act', action: { type: 'join', code, nick: '老王' } });
    expect(((await dispatch(db, P2, { op: 'act', action: { type: 'start', code } })) as R).reason).toBe('not_owner');

    const started = (await dispatch(db, P1, { op: 'act', action: { type: 'start', code } })) as R;
    expect(started.ok).toBe(true);
    const state = await getState(db, code);
    expect(state.phase).toBe('bidding');
    expect(state.round).toBe(1);

    // 手牌：每人 5 颗、只存 hands 集合、owner 只能读自己的（铁律 8 的数据面）
    const myHand = (await dispatch(db, P1, { op: 'hand', code })) as R;
    expect(myHand.ok).toBe(true);
    expect(myHand.dice).toHaveLength(5);
    for (const d of myHand.dice) expect(d).toBeGreaterThanOrEqual(1);
    expect(state.revealedHands).toBeNull(); // room 文档无未揭晓手牌

    expect(((await dispatch(db, P1, { op: 'act', action: { type: 'start', code } })) as R).reason).toBe('wrong_phase');
  });
});

describe('bid + CAS', () => {
  it('轮次校验 + 非法叫骰被拒 + 合法叫骰推进', async () => {
    const { db, code } = await createJoined();
    await dispatch(db, P1, { op: 'act', action: { type: 'start', code } });
    let state = await getState(db, code);
    const v = state.version;

    // 不是 P2 的回合
    const wrongTurn = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'bid', code, count: 3, face: 4, isZhai: false, expectedVersion: v },
    })) as R;
    expect(wrongTurn.reason).toBe('not_your_turn');

    // 低于开局门槛（2 人局 floor = ceil(1.5×2) = 3）
    const tooLow = (await dispatch(db, P1, {
      op: 'act',
      action: { type: 'bid', code, count: 2, face: 4, isZhai: false, expectedVersion: v },
    })) as R;
    expect(tooLow.ok).toBe(false);

    const okBid = (await dispatch(db, P1, {
      op: 'act',
      action: { type: 'bid', code, count: 3, face: 4, isZhai: false, expectedVersion: v },
    })) as R;
    expect(okBid.ok).toBe(true);
    state = await getState(db, code);
    expect(state.lastBid).toEqual({ count: 3, face: 4, isZhai: false });
    expect(state.bidChain).toHaveLength(1);
    expect(state.players[state.currentTurnIdx].id).toBe(P2);
  });

  it('并发 bid 同一 expectedVersion：只允许一个提交（CAS 冲突）', async () => {
    const { db, code } = await createJoined();
    await dispatch(db, P1, { op: 'act', action: { type: 'start', code } });
    const state = await getState(db, code);
    const v = state.version;

    // P1 是当前回合玩家 —— 两个并发 bid 都以 version v 提交
    const [a, b] = (await Promise.all([
      dispatch(db, P1, { op: 'act', action: { type: 'bid', code, count: 3, face: 4, isZhai: false, expectedVersion: v } }),
      dispatch(db, P1, { op: 'act', action: { type: 'bid', code, count: 4, face: 4, isZhai: false, expectedVersion: v } }),
    ])) as [R, R];

    const oks = [a, b].filter((r) => r.ok);
    const stales = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(stales).toHaveLength(1);
    expect(stales[0].reason).toBe('stale');

    const after = await getState(db, code);
    expect(after.bidChain).toHaveLength(1); // 只有一口叫成立
  });
});

describe('开（challenge）→ nextRound → game_end → rematch + 战绩', () => {
  it('确定手牌下的完整终局序列', async () => {
    const { db, code } = await createJoined();
    await dispatch(db, P1, { op: 'act', action: { type: 'start', code } });

    // 锁定确定手牌：场上没有 4、也没有万能 1 → 任何 4 的叫骰都是吹牛
    db.forceHands(code, 1, { [P1]: [2, 2, 3, 3, 5], [P2]: [5, 5, 6, 6, 3] });
    let state = await getState(db, code);

    // P1 叫 3×4（吹牛）→ P2 开
    await dispatch(db, P1, {
      op: 'act',
      action: { type: 'bid', code, count: 3, face: 4, isZhai: false, expectedVersion: state.version },
    });
    state = await getState(db, code);
    const challenged = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'challenge', code, expectedVersion: state.version },
    })) as R;
    expect(challenged.ok).toBe(true);

    state = await getState(db, code);
    expect(state.phase).toBe('reveal');
    expect(state.lastChallengeResult.kind).toBe('challenge');
    expect(state.lastChallengeResult.loserIds).toEqual([P1]); // 吹牛的 P1 输
    expect(state.revealedHands[P1]).toEqual([2, 2, 3, 3, 5]); // 揭晓后手牌公开进文档
    expect(state.players[0].diceLeft).toBe(4);

    // 战绩：P2 开成功 challengesWon+1、P1 challengesLost+1
    const s1 = (await dispatch(db, P1, { op: 'stats' })) as R;
    const s2 = (await dispatch(db, P2, { op: 'stats' })) as R;
    expect(s1.stats.challengesLost).toBe(1);
    expect(s2.stats.challengesWon).toBe(1);

    // nextRound：新一轮发牌、揭晓手牌清空
    const next = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'nextRound', code, expectedVersion: state.version },
    })) as R;
    expect(next.ok).toBe(true);
    state = await getState(db, code);
    expect(state.phase).toBe('bidding');
    expect(state.round).toBe(2);
    expect(state.revealedHands).toBeNull();
    const hand = (await dispatch(db, P1, { op: 'hand', code })) as R;
    expect(hand.dice).toHaveLength(4); // 输一颗

    // 直接构造终局：P1 只剩 1 颗，再输一次即出局
    db.forceRoom(code, (doc) => {
      doc.players[0].diceLeft = 1;
    });
    db.forceHands(code, 2, { [P1]: [2], [P2]: [5, 5, 6, 6, 3] });
    state = await getState(db, code);
    await dispatch(db, P1, {
      op: 'act',
      action: { type: 'bid', code, count: 3, face: 4, isZhai: false, expectedVersion: state.version },
    });
    state = await getState(db, code);
    await dispatch(db, P2, { op: 'act', action: { type: 'challenge', code, expectedVersion: state.version } });
    state = await getState(db, code);
    expect(state.lastChallengeResult.gameEnded).toBe(true);

    const ended = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'nextRound', code, expectedVersion: state.version },
    })) as R;
    expect(ended.ok).toBe(true);
    state = await getState(db, code);
    expect(state.phase).toBe('game_end');

    // 终局战绩：两人 gamesPlayed=1，胜者 P2 wins=1
    const f1 = (await dispatch(db, P1, { op: 'stats' })) as R;
    const f2 = (await dispatch(db, P2, { op: 'stats' })) as R;
    expect(f1.stats.gamesPlayed).toBe(1);
    expect(f2.stats.gamesPlayed).toBe(1);
    expect(f1.stats.wins).toBe(0);
    expect(f2.stats.wins).toBe(1);
    expect(f2.stats.nick).toBe('老王');

    // rematch：满血回大厅、手牌清空
    expect(((await dispatch(db, P2, { op: 'act', action: { type: 'rematch', code } })) as R).reason).toBe('not_owner');
    const rematch = (await dispatch(db, P1, { op: 'act', action: { type: 'rematch', code } })) as R;
    expect(rematch.ok).toBe(true);
    state = await getState(db, code);
    expect(state.phase).toBe('lobby');
    expect(state.players.every((p: R) => p.alive && p.diceLeft === 5)).toBe(true);
    expect((await dispatch(db, P1, { op: 'hand', code })) as R).toMatchObject({ ok: false, reason: 'no_hand' });
  });
});

describe('leave / setAvatar / updateRules', () => {
  it('lobby leave：转移房主；空房删除', async () => {
    const { db, code } = await createJoined();
    const left = (await dispatch(db, P1, { op: 'act', action: { type: 'leave', code } })) as R;
    expect(left.ok).toBe(true);
    const state = await getState(db, code);
    expect(state.ownerId).toBe(P2);
    expect(state.players).toHaveLength(1);

    const last = (await dispatch(db, P2, { op: 'act', action: { type: 'leave', code } })) as R;
    expect(last.roomClosed).toBe(true);
    expect(((await dispatch(db, P1, { op: 'get', code })) as R).reason).toBe('no_room');
  });

  it('局中 leave：标记死亡、剩 1 人终局', async () => {
    const { db, code } = await createJoined();
    await dispatch(db, P1, { op: 'act', action: { type: 'start', code } });
    const left = (await dispatch(db, P1, { op: 'act', action: { type: 'leave', code } })) as R;
    expect(left.ok).toBe(true);
    const state = await getState(db, code);
    expect(state.phase).toBe('game_end');
    expect(state.players[0].alive).toBe(false);
    expect(state.lastChallengeResult.winnerIdx).toBe(1);
  });

  it('updateRules：owner+lobby only，diceLeft 跟随', async () => {
    const { db, code } = await createJoined();
    const rules = {
      diceCount: 3,
      aceWild: true,
      allowZhai: true,
      startingBidFactor: 1.5,
      diceSides: 6,
      chineseExtensions: { pi: true, fanpi: true, tongsha: true },
      paliFicoVariant: false,
    };
    expect(
      ((await dispatch(db, P2, { op: 'act', action: { type: 'updateRules', code, rules } })) as R).reason,
    ).toBe('not_owner');
    const updated = (await dispatch(db, P1, { op: 'act', action: { type: 'updateRules', code, rules } })) as R;
    expect(updated.ok).toBe(true);
    const state = await getState(db, code);
    expect(state.rules.diceCount).toBe(3);
    expect(state.players.every((p: R) => p.diceLeft === 3)).toBe(true);
  });

  it('setAvatar：lobby-only 更新头像', async () => {
    const { db, code } = await createJoined();
    const r = (await dispatch(db, P2, {
      op: 'act',
      action: { type: 'setAvatar', code, avatarUrl: 'https://example.com/new.png' },
    })) as R;
    expect(r.ok).toBe(true);
    const state = await getState(db, code);
    expect(state.players[1].avatar).toBe('https://example.com/new.png');
  });
});

describe('boundary', () => {
  it('非法入参被 zod 拒绝', async () => {
    const db = fakeRoomDb();
    expect(((await dispatch(db, P1, { op: 'act', action: { type: 'bid', code: 'ABCDEF', count: 9999, face: 4, isZhai: false, expectedVersion: 1 } })) as R).reason).toBe('invalid_request');
    expect(((await dispatch(db, P1, { op: 'act', action: { type: 'nope' } })) as R).reason).toBe('invalid_request');
    expect(((await dispatch(db, P1, { op: 'unknown-op' })) as R).ok).toBe(false);
  });

  it('echo 兼容（WXAPP-1 冒烟接口）', async () => {
    const db = fakeRoomDb();
    const r = (await dispatch(db, P1, { action: 'echo', payload: 'x' })) as R;
    expect(r).toEqual({ ok: true, echo: 'x', openid: P1 });
  });
});
