/**
 * 当前叫 hero 横幅（#11：对手叫了什么最重要，必须最醒目）。
 * 有 lastBid → 大号骰子面 + ×数量 + 叫家昵称 + 斋徽章。
 * 无 lastBid → 提示谁开第一口（轮到我 vs 等别人）。
 */
import { Text, View } from '@tarojs/components'
import type { RoomState } from '@/lib/game-engine/types'
import { DiceFace } from './DiceFace'

export function CurrentBid({ state, myId }: { state: RoomState; myId: string | null }) {
  const turnNick = state.players[state.currentTurnIdx]?.nick ?? '?'
  const isMyTurn = state.players[state.currentTurnIdx]?.id === myId

  if (!state.lastBid) {
    return (
      <View className='flex flex-col items-center gap-1 rounded-2xl border border-dashed border-gray-300 bg-white py-4 dark:border-gray-600 dark:bg-gray-800'>
        <Text className='text-xs uppercase tracking-wide text-gray-400'>本轮叫骰</Text>
        <Text className='text-base font-medium text-gray-700 dark:text-gray-200'>
          {isMyTurn ? '轮到你开第一口' : `等 ${turnNick} 开第一口`}
        </Text>
      </View>
    )
  }

  const bidderId = state.bidChain.length ? state.bidChain[state.bidChain.length - 1].playerId : null
  const bidderNick = state.players.find((p) => p.id === bidderId)?.nick ?? '?'

  return (
    <View className='flex flex-col items-center gap-2 rounded-2xl border-2 border-red-400 bg-red-50 py-4 dark:border-red-500 dark:bg-red-950'>
      <Text className='text-xs uppercase tracking-wide text-red-500 dark:text-red-300'>
        {bidderNick} 叫
      </Text>
      <View className='flex items-center gap-3'>
        <Text className='text-5xl font-bold text-gray-900 dark:text-gray-50'>{state.lastBid.count}</Text>
        <Text className='text-3xl text-gray-400'>×</Text>
        <DiceFace face={state.lastBid.face} size={96} />
        {state.lastBid.isZhai && (
          <View className='rounded-full bg-amber-200 px-2 py-1 dark:bg-amber-800'>
            <Text className='text-sm font-bold text-amber-700 dark:text-amber-100'>斋</Text>
          </View>
        )}
      </View>
    </View>
  )
}
