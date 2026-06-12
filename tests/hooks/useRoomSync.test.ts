// @vitest-environment happy-dom
/**
 * WXAPP-3 verify（逻辑面）：双通道去重 / 轮询兜底 / watch 退避重建 / 终态停机 / 卸载清理。
 * 全部走注入 deps —— 零 Taro 依赖，fake watch + fake fetch + fake timers。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSnapshot, RoomSyncDeps, WatchHandle } from '../../src/hooks/useRoomSync';
import { useRoomSync } from '../../src/hooks/useRoomSync';

const snap = (version: number): RoomSnapshot =>
  ({ code: 'ABCDEF', phase: 'lobby', players: [], version }) as unknown as RoomSnapshot;

type FakeWatch = {
  builds: number;
  closes: number;
  emit: (doc: RoomSnapshot) => void;
  fail: (err?: unknown) => void;
  deps: RoomSyncDeps['watchRoom'];
};

function fakeWatchFactory(): FakeWatch {
  const f: FakeWatch = {
    builds: 0,
    closes: 0,
    emit: () => {},
    fail: () => {},
    deps: (_code, onSnapshot, onError): WatchHandle => {
      f.builds += 1;
      f.emit = onSnapshot;
      f.fail = onError;
      return {
        close: () => {
          f.closes += 1;
        },
      };
    },
  };
  return f;
}

describe('useRoomSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(fetchImpl?: RoomSyncDeps['fetchRoom']) {
    const watch = fakeWatchFactory();
    const fetchRoom = vi.fn(fetchImpl ?? (async () => ({ ok: true, state: snap(1) })));
    const hook = renderHook(({ code }) => useRoomSync(code, { watchRoom: watch.deps, fetchRoom }), {
      initialProps: { code: 'ABCDEF' as string | null },
    });
    return { watch, fetchRoom, hook };
  }

  it('挂载即拉取 + 建 watch；首包应用', async () => {
    const { watch, fetchRoom, hook } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    expect(watch.builds).toBe(1);
    expect(hook.result.current.state?.version).toBe(1);
  });

  it('version 单调去重：旧版本快照被丢弃，新版本应用，同版本只刷新鲜度', async () => {
    const { watch, hook } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => watch.emit(snap(3)));
    expect(hook.result.current.state?.version).toBe(3);

    const beforeSync = hook.result.current.lastSyncAt;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    act(() => watch.emit(snap(2))); // 旧版本 —— 状态不回退
    expect(hook.result.current.state?.version).toBe(3);
    expect(hook.result.current.lastSyncAt).toBeGreaterThanOrEqual(beforeSync); // 但算一次活信号
  });

  it('3s 轮询兜底：watch 不动时 poll 推进状态', async () => {
    let version = 1;
    const { fetchRoom, hook } = setup(async () => ({ ok: true, state: snap(version) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.state?.version).toBe(1);

    version = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchRoom).toHaveBeenCalledTimes(2);
    expect(hook.result.current.state?.version).toBe(5);
  });

  it('watch 掉线 → 指数退避重建（1s、2s）', async () => {
    const { watch } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(watch.builds).toBe(1);

    act(() => watch.fail(new Error('watch died')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(watch.builds).toBe(1); // 还没到 1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(watch.builds).toBe(2); // 1s 重建

    act(() => watch.fail(new Error('again')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(watch.builds).toBe(3); // 2s 重建（翻倍）
  });

  it('成功推送重置退避计数', async () => {
    const { watch } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => watch.fail(new Error('x')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(watch.builds).toBe(2);
    act(() => watch.emit(snap(2))); // 成功推送 → 退避归零
    act(() => watch.fail(new Error('y')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(watch.builds).toBe(3); // 又是 1s（不是 2s）
  });

  it('no_room 终态：停轮询、关 watch、报 fatal', async () => {
    const { watch, fetchRoom, hook } = setup(async () => ({ ok: false, reason: 'no_room' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.fatal).toBe('no_room');
    expect(watch.closes).toBeGreaterThanOrEqual(1);

    const calls = fetchRoom.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchRoom.mock.calls.length).toBe(calls); // 轮询已停
  });

  it('卸载清理：watch 关闭、轮询停止', async () => {
    const { watch, fetchRoom, hook } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    hook.unmount();
    expect(watch.closes).toBe(1);
    const calls = fetchRoom.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchRoom.mock.calls.length).toBe(calls);
  });

  it('resync 立即拉取', async () => {
    const { fetchRoom, hook } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const calls = fetchRoom.mock.calls.length;
    await act(async () => {
      await hook.result.current.resync();
    });
    expect(fetchRoom.mock.calls.length).toBe(calls + 1);
  });
});
