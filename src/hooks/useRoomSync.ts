/**
 * useRoomSync — 实时同步双通道（铁律 6）：
 *   主通道 db.watch（推送快照）+ 兜底 3s 轮询（room.get 云函数），UI 以 version 单调递增去重。
 *   watch 掉线 → 指数退避重建（1s→2s→…→30s cap）；轮询独立于 watch 永远在跑。
 *   断线 UI 由 lastSyncAt（数据新鲜度）驱动，不由 watch 连接状态驱动（web 版教训）。
 *
 * 依赖全注入（deps）—— 测试传 fake，运行时用 useRoomSyncCloud 包装（真 Taro.cloud 实现）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoomState } from '@/lib/game-engine/types'

/** rooms 文档（含云函数侧附加字段）*/
export type RoomSnapshot = RoomState & {
  revealedHands?: Record<string, number[]> | null
  updatedAt?: number
}

export type WatchHandle = { close: () => void }

export type RoomSyncDeps = {
  /** db.watch 封装：快照/变更回调 + 错误回调，返回可关闭句柄 */
  watchRoom: (
    code: string,
    onSnapshot: (doc: RoomSnapshot) => void,
    onError: (err: unknown) => void,
  ) => WatchHandle
  /** room.get 云函数封装 */
  fetchRoom: (code: string) => Promise<{ ok: boolean; reason?: string; state?: RoomSnapshot }>
  /** 时钟注入（测试可控） */
  now?: () => number
  pollMs?: number
  backoffBaseMs?: number
  backoffCapMs?: number
}

export type RoomSync = {
  state: RoomSnapshot | null
  /** 终态错误（no_room / invalid_code）—— 房间不存在级别，轮询已停止 */
  fatal: string | null
  /** 最近一次确认数据新鲜的时刻（applied 或 poll 确认同版本都算） */
  lastSyncAt: number
  resync: () => Promise<void>
}

const POLL_MS = 3000
const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 30000
/** 房间不存在级别的 reason —— 重试无意义，停轮询交给页面渲染 join 失败态 */
const FATAL_REASONS = new Set(['no_room', 'invalid_code'])

export function useRoomSync(code: string | null, deps: RoomSyncDeps): RoomSync {
  const { watchRoom, fetchRoom } = deps
  const now = deps.now ?? Date.now
  const pollMs = deps.pollMs ?? POLL_MS
  const backoffBase = deps.backoffBaseMs ?? BACKOFF_BASE_MS
  const backoffCap = deps.backoffCapMs ?? BACKOFF_CAP_MS

  const [state, setState] = useState<RoomSnapshot | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number>(() => now())

  const versionRef = useRef(0)
  const fatalRef = useRef(false)
  const closedRef = useRef(false)
  const watchRef = useRef<WatchHandle | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  /** version 单调去重：只接受更新的快照；同版本只刷新鲜度 */
  const apply = useCallback(
    (doc: RoomSnapshot) => {
      if (closedRef.current || fatalRef.current) return
      if (typeof doc?.version !== 'number') return
      if (doc.version > versionRef.current) {
        versionRef.current = doc.version
        setState(doc)
      }
      setLastSyncAt(now())
    },
    [now],
  )

  const markFatal = useCallback((reason: string) => {
    fatalRef.current = true
    setFatal(reason)
    watchRef.current?.close()
    watchRef.current = null
  }, [])

  const poll = useCallback(async () => {
    if (!code || closedRef.current || fatalRef.current) return
    try {
      const res = await fetchRoom(code)
      if (res.ok && res.state) apply(res.state)
      else if (res.reason && FATAL_REASONS.has(res.reason)) markFatal(res.reason)
      // 其余失败（网络抖动等）静默 —— 新鲜度不更新，staleness 自然驱动断线 UI
    } catch {
      // 同上：轮询失败即数据变陈，无需额外状态
    }
  }, [code, fetchRoom, apply, markFatal])

  useEffect(() => {
    if (!code) return
    closedRef.current = false
    fatalRef.current = false
    versionRef.current = 0
    setState(null)
    setFatal(null)
    setLastSyncAt(now())

    let backoffAttempt = 0

    const buildWatch = () => {
      if (closedRef.current || fatalRef.current) return
      watchRef.current = watchRoom(
        code,
        (doc) => {
          backoffAttempt = 0 // 任何成功推送都重置退避
          apply(doc)
        },
        () => {
          // watch 掉线：关掉旧的，指数退避重建（轮询兜底期间数据仍在续命）
          watchRef.current?.close()
          watchRef.current = null
          const delay = Math.min(backoffBase * 2 ** backoffAttempt, backoffCap)
          backoffAttempt += 1
          const t = setTimeout(buildWatch, delay)
          timersRef.current.push(t)
        },
      )
    }

    void poll() // 进房立即拉一发（watch 首包可能有延迟）
    buildWatch()
    const interval = setInterval(() => void poll(), pollMs)

    return () => {
      closedRef.current = true
      clearInterval(interval)
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
      watchRef.current?.close()
      watchRef.current = null
    }
    // poll/apply 依赖 code/fetchRoom —— 这里仅在 code 变化时重建整个同步管线
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return { state, fatal, lastSyncAt, resync: poll }
}
