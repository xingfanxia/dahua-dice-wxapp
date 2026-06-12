/**
 * useRoomSync 的运行时包装 —— 注入真 Taro.cloud 实现。
 * 单独成文件的原因：测试只 import useRoomSync 核心（零 Taro 依赖），页面 import 这里。
 */
import Taro from '@tarojs/taro'
import type { RoomSnapshot, RoomSyncDeps } from './useRoomSync'
import { useRoomSync } from './useRoomSync'

function cloudDeps(): RoomSyncDeps {
  return {
    watchRoom(code, onSnapshot, onError) {
      const db = Taro.cloud.database()
      const watcher = db
        .collection('rooms')
        .where({ _id: code })
        .watch({
          onChange(snapshot: { docs?: RoomSnapshot[] }) {
            const doc = snapshot.docs?.[0]
            if (doc) onSnapshot(doc)
          },
          onError,
        })
      return { close: () => watcher.close() }
    },
    async fetchRoom(code) {
      const res = await Taro.cloud.callFunction({ name: 'room', data: { op: 'get', code } })
      return (res.result ?? { ok: false, reason: 'empty_result' }) as {
        ok: boolean
        reason?: string
        state?: RoomSnapshot
      }
    },
  }
}

export function useRoomSyncCloud(code: string | null) {
  return useRoomSync(code, cloudDeps())
}

/** 我的手牌（round 变化时拉取；带 round 标签防旧响应覆写新一轮 —— web 版教训） */
export async function fetchMyHand(code: string): Promise<{ ok: boolean; round?: number; dice?: number[] }> {
  const res = await Taro.cloud.callFunction({ name: 'room', data: { op: 'hand', code } })
  return (res.result ?? { ok: false }) as { ok: boolean; round?: number; dice?: number[] }
}
