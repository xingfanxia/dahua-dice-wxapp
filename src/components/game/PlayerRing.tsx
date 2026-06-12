/** 玩家环 —— 移植自 web 版 PlayerRing（当前回合高亮 / 出局变灰 / 剩骰数）。 */
import { Text, View } from '@tarojs/components'
import type { RoomState } from '@/lib/game-engine/types'
import { AvatarBadge } from './AvatarBadge'

export function PlayerRing({ state, myId }: { state: RoomState; myId: string | null }) {
  const turnPlayer = state.players[state.currentTurnIdx]
  return (
    <View className='flex flex-wrap items-center justify-center gap-2'>
      {state.players.map((p) => {
        const isCurrent = turnPlayer?.id === p.id && (state.phase === 'bidding' || state.phase === 'rolling')
        return (
          <View
            key={p.id}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-1.5 ${
              isCurrent
                ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950'
                : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            } ${p.alive ? '' : 'opacity-40'}`}
          >
            <AvatarBadge url={p.avatar} nick={p.nick} />
            <Text className='text-xs font-medium text-gray-900 dark:text-gray-100'>
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
