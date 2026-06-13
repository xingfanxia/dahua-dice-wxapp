/** 揭晓舞台 —— 全员手牌 + 命中高亮（含万能 1）+ 输家/终局结果。loseDie=false 时文案改"喝一杯"。 */
import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import type { RoomState } from '@/lib/game-engine/types'
import { AvatarBadge } from './AvatarBadge'
import { DiceFace } from './DiceFace'

export function RevealStage({
  state,
  hands,
  myId,
}: {
  state: RoomState
  hands: Record<string, number[]> | null
  myId: string | null
}) {
  const [showResult, setShowResult] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShowResult(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  if (!hands || !state.lastBid) {
    return <Text className='block text-center text-sm text-gray-400'>等待揭晓…</Text>
  }

  const result = state.lastChallengeResult ?? null
  const verified = result?.verifiedBid ?? state.lastBid
  const wildCount = state.rules.aceWild && !verified.isZhai && !(state.palificoActive ?? false)
  const loserNames = (result?.loserIds ?? [])
    .map((id) => state.players.find((p) => p.id === id)?.nick ?? '?')
    .join('、')
  const kindLabel = result?.kind === 'pi' ? '劈!' : result?.kind === 'tongsha' ? '通杀!' : '开'
  const noElim = state.rules.loseDie === false

  return (
    <View className='flex flex-col gap-4'>
      <Text className='block text-center text-2xl font-bold text-red-500'>揭晓!</Text>

      <View className='flex flex-col gap-2'>
        {state.players.map((p) => {
          const hand = hands[p.id] ?? []
          const isMe = p.id === myId
          return (
            <View
              key={p.id}
              className={`flex items-center justify-between rounded-xl bg-white p-2.5 dark:bg-gray-800 ${
                isMe ? 'border border-red-300 dark:border-red-600' : ''
              }`}
            >
              <View className='flex items-center gap-2'>
                <AvatarBadge url={p.avatar} nick={p.nick} size='sm' />
                <Text className='text-sm text-gray-900 dark:text-gray-100'>
                  {p.nick}
                  {isMe ? '（你）' : ''}
                  {!p.alive ? ' 💀' : ''}
                </Text>
              </View>
              <View className='flex flex-wrap items-center justify-end gap-1'>
                {hand.map((face, j) => {
                  const counted = face === verified.face || (face === 1 && wildCount)
                  return (
                    <DiceFace
                      key={`${p.id}-${j}`}
                      face={face}
                      size={48}
                      style={counted ? undefined : { opacity: 0.4 }}
                    />
                  )
                })}
              </View>
            </View>
          )
        })}
      </View>

      {showResult && result && (
        <View className='mt-1 flex flex-col items-center gap-1.5'>
          <Text className='text-sm tracking-wide text-amber-600'>{kindLabel}</Text>
          <View className='flex items-center gap-2'>
            <Text className='text-sm text-gray-900 dark:text-gray-100'>叫 {verified.count} ×</Text>
            <DiceFace face={verified.face} size={40} />
            <Text className='text-sm text-gray-900 dark:text-gray-100'>
              · 实际 {result.actualCount}
              {wildCount ? '（含 1 点）' : ''}
            </Text>
          </View>
          {!!loserNames &&
            (noElim ? (
              <Text className='text-base text-red-500'>🍺 本轮 {loserNames} 输了 · 喝一杯！</Text>
            ) : (
              <Text className='text-base text-red-500'>
                💀 {loserNames}{' '}
                {result.loserIds.length === 1 && result.diceLost > 1
                  ? `输 ${result.diceLost} 颗骰`
                  : '输一颗骰'}
              </Text>
            ))}
          {result.gameEnded && result.winnerIdx >= 0 && (
            <Text className='mt-2 text-xl font-bold text-amber-500'>
              🏆 {state.players[result.winnerIdx]?.nick ?? '?'}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
