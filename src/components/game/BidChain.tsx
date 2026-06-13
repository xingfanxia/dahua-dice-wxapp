import { Text, View } from '@tarojs/components'
import type { RoomState } from '@/lib/game-engine/types'
import { AvatarBadge } from './AvatarBadge'
import { DiceFace } from './DiceFace'

// 本轮叫骰历史（当前叫由 CurrentBid hero 单独突出；这里是可滚动的历史链，次要信息）。

export function BidChain({ state }: { state: RoomState }) {
  // Array.isArray (not ?? []): a cjson-encoded empty table arrives as {} not [].
  const chain = Array.isArray(state.bidChain) ? state.bidChain : []
  if (chain.length <= 1) return null // 0 或仅当前叫（hero 已展示）时不重复

  return (
    <View className='flex flex-col gap-1.5'>
      <Text className='text-xs uppercase tracking-wide text-gray-400'>叫骰历史</Text>
      {chain.slice(0, -1).map((entry, i) => {
        const player = state.players.find((p) => p.id === entry.playerId)
        return (
          <View
            key={`${entry.playerId}-${i}`}
            className='flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1 opacity-70 dark:bg-gray-800'
          >
            <AvatarBadge url={player?.avatar} nick={player?.nick ?? '?'} size='sm' />
            <Text className='text-xs text-gray-500 dark:text-gray-400'>{player?.nick ?? '?'}</Text>
            <View className='ml-auto flex items-center gap-1.5'>
              <Text className='text-sm text-gray-700 dark:text-gray-200'>{entry.bid.count}</Text>
              <Text className='text-xs text-gray-400'>×</Text>
              <DiceFace face={entry.bid.face} size={36} />
              {entry.bid.isZhai && <Text className='text-xs text-amber-600'>斋</Text>}
            </View>
          </View>
        )
      })}
    </View>
  )
}
