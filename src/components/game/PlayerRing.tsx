/** 玩家环 —— 当前回合明显高亮（红边 + 🎯 标 + 名字加重）/ 出局变灰 / 剩骰数。 */
import { Text, View } from '@tarojs/components'
import type { RoomState } from '@/lib/game-engine/types'
import { AvatarBadge } from './AvatarBadge'

export function PlayerRing({ state, myId }: { state: RoomState; myId: string | null }) {
  const turnPlayer = state.players[state.currentTurnIdx]
  const inPlay = state.phase === 'bidding' || state.phase === 'rolling'
  return (
    <View className='flex flex-wrap items-stretch justify-center gap-2'>
      {state.players.map((p) => {
        const isCurrent = inPlay && turnPlayer?.id === p.id
        return (
          <View
            key={p.id}
            className={`relative flex flex-col items-center gap-1 rounded-xl border px-2.5 py-1.5 ${
              isCurrent
                ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950'
                : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            } ${p.alive ? '' : 'opacity-40'}`}
          >
            {isCurrent && (
              <View className='absolute -top-2 rounded-full bg-red-500 px-1.5'>
                <Text className='text-[20rpx] text-white'>🎯 该ta</Text>
              </View>
            )}
            <AvatarBadge url={p.avatar} nick={p.nick} />
            <Text
              className={`text-xs ${isCurrent ? 'font-bold text-red-600 dark:text-red-300' : 'font-medium text-gray-900 dark:text-gray-100'}`}
            >
              {p.nick}
              {p.id === myId ? '（你）' : ''}
            </Text>
            <Text className='text-xs text-gray-500 dark:text-gray-400'>
              🎲 {p.diceLeft}
              {!p.alive && ' 💀'}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
