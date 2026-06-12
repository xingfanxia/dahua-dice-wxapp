/**
 * 我的手牌区：暗置/明置切换（盖住防偷看）+ 新一轮自动播摇骰音效+震动（纯装饰，骰子服务端 roll —— 铁律 4）。
 */
import { Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { playDiceSound, vibrate } from '@/lib/diceSound'

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8']

export function DiceRow({ hand, round }: { hand: number[] | null; round: number }) {
  const [covered, setCovered] = useState(false)
  const lastRoundRef = useRef<number | null>(null)

  // 新一轮手牌到位 → 摇骰音效 + 震动（每轮一次）
  useEffect(() => {
    if (!hand || hand.length === 0) return
    if (lastRoundRef.current === round) return
    lastRoundRef.current = round
    playDiceSound()
    vibrate()
  }, [hand, round])

  if (!hand) {
    return (
      <View className='flex h-20 items-center justify-center rounded-2xl bg-white dark:bg-gray-800'>
        <Text className='text-sm text-gray-400'>掷骰中…</Text>
      </View>
    )
  }

  return (
    <View
      className='flex flex-col items-center gap-1 rounded-2xl bg-white py-3 dark:bg-gray-800'
      onClick={() => setCovered((c) => !c)}
    >
      <View className='flex gap-2'>
        {hand.map((face, i) => (
          <Text key={`${round}-${i}`} className='text-4xl text-gray-900 dark:text-gray-100'>
            {covered ? '🎲' : DICE_GLYPHS[face - 1]}
          </Text>
        ))}
      </View>
      <Text className='text-xs text-gray-400'>{covered ? '已盖住 · 点一下查看' : '你的骰子 · 点一下盖住'}</Text>
    </View>
  )
}
