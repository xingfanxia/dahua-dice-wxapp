/**
 * 我的手牌区（WXAPP-7 摇骰动画简化版）：新一轮先滚 0.7s（🎲 tumble + 音效 + 震动），
 * 落定后 pop 出真实点数（动画纯装饰，骰子服务端 roll —— 铁律 4）。
 * 暗置/明置切换防偷看；自动按点数统计（万能 1 以 (+n) 标注，斋局由调用方关掉）。
 */
import { Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { summarizeHand } from '@/lib/handSummary'
import { playDiceSound, vibrate } from '@/lib/diceSound'
import './DiceRow.scss'

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8']
const TUMBLE_MS = 700

export function DiceRow({ hand, round, aceWild = false }: { hand: number[] | null; round: number; aceWild?: boolean }) {
  const [covered, setCovered] = useState(false)
  const [tumbling, setTumbling] = useState(false)
  const lastRoundRef = useRef<number | null>(null)

  // 新一轮手牌到位 → 摇骰动画 + 音效 + 震动（每轮一次）
  useEffect(() => {
    if (!hand || hand.length === 0) return
    if (lastRoundRef.current === round) return
    lastRoundRef.current = round
    playDiceSound()
    vibrate()
    setTumbling(true)
    const t = setTimeout(() => setTumbling(false), TUMBLE_MS)
    return () => clearTimeout(t)
  }, [hand, round])

  if (!hand) {
    return (
      <View className='flex h-24 items-center justify-center rounded-2xl bg-white dark:bg-gray-800'>
        <Text className='text-sm text-gray-400'>掷骰中…</Text>
      </View>
    )
  }

  const hidden = tumbling || covered

  return (
    <View
      className='flex flex-col items-center gap-2 rounded-2xl bg-white py-5 dark:bg-gray-800'
      onClick={() => !tumbling && setCovered((c) => !c)}
    >
      <View className='flex flex-wrap items-center justify-center gap-3 px-3'>
        {hand.map((face, i) => (
          <Text
            key={`${round}-${i}`}
            className={`text-[150rpx] leading-none text-gray-900 dark:text-gray-100 ${
              tumbling ? 'dice-tumbling' : 'dice-revealed'
            }`}
            style={tumbling ? { animationDelay: `${i * 60}ms` } : undefined}
          >
            {hidden ? '🎲' : DICE_GLYPHS[face - 1]}
          </Text>
        ))}
      </View>

      {/* 点数统计（盖住/摇动时一并隐藏，防偷看） */}
      {!hidden && (
        <View className='flex flex-wrap items-center justify-center gap-2 px-3'>
          {summarizeHand(hand, aceWild).map((row) => (
            <View key={row} className='rounded-lg bg-gray-100 px-2.5 py-1 dark:bg-gray-700'>
              <Text className='text-base font-medium text-gray-700 dark:text-gray-200'>{row}</Text>
            </View>
          ))}
        </View>
      )}

      <Text className='text-xs text-gray-400'>
        {tumbling ? '摇骰中…' : covered ? '已盖住 · 点一下查看' : '你的骰子 · 点一下盖住'}
      </Text>
    </View>
  )
}
