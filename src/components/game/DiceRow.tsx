/**
 * 我的手牌区（摇骰仪式感版，#8）：新一轮手牌到位后**默认盖住**，提示「摇一摇 / 点一下 看骰子」；
 * 用户摇手机或点一下 → tumble 0.7s（音效+震动）→ 揭晓点数 + 统计。再点一下重新盖住。
 * 骰子服务端 roll（铁律 4），这里的摇只是揭晓手势 + 仪式感 + 防偷看。
 * timer 用 ref 管理只在卸载/新一轮清理（手牌引用同轮可能换新数组，挂 effect cleanup 会卡死 tumbling）。
 */
import { Text, View } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DiceFace } from './DiceFace'
import { useShake } from '@/hooks/useShake'
import { summarizeHand } from '@/lib/handSummary'
import { playDiceSound, vibrate } from '@/lib/diceSound'
import './DiceRow.scss'

const TUMBLE_MS = 700

export function DiceRow({ hand, round }: { hand: number[] | null; round: number }) {
  const [revealed, setRevealed] = useState(false)
  const [tumbling, setTumbling] = useState(false)
  const lastRoundRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 新一轮 → 复位为盖住、等手势
  useEffect(() => {
    if (round !== lastRoundRef.current) {
      lastRoundRef.current = round
      setRevealed(false)
      setTumbling(false)
    }
  }, [round])

  const doReveal = useCallback(() => {
    if (!hand || hand.length === 0 || revealed || tumbling) return
    playDiceSound()
    vibrate()
    setTumbling(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTumbling(false)
      setRevealed(true)
    }, TUMBLE_MS)
  }, [hand, revealed, tumbling])

  // 摇手机揭晓（仅在盖住、有手牌时监听）
  useShake(doReveal, !!hand && hand.length > 0 && !revealed && !tumbling)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (!hand || hand.length === 0) {
    return (
      <View className='flex h-28 items-center justify-center rounded-2xl bg-white dark:bg-gray-800'>
        <Text className='text-sm text-gray-400'>掷骰中…</Text>
      </View>
    )
  }

  // 盖住态：仪式感提示
  if (!revealed && !tumbling) {
    return (
      <View
        className='flex flex-col items-center gap-2.5 rounded-2xl bg-white py-5 dark:bg-gray-800'
        onClick={doReveal}
      >
        <View className='flex items-center justify-center gap-2'>
          {hand.map((_, i) => (
            <DiceFace key={i} face={1} size={88} hidden />
          ))}
        </View>
        <View className='flex items-center gap-1.5'>
          <Text className='text-base'>🤚</Text>
          <Text className='text-sm font-medium text-red-500'>摇一摇 · 或点一下 · 看你的骰子</Text>
        </View>
      </View>
    )
  }

  // 摇动 / 揭晓
  return (
    <View
      className='flex flex-col items-center gap-2 rounded-2xl bg-white py-5 dark:bg-gray-800'
      onClick={() => revealed && setRevealed(false)}
    >
      <View className='flex flex-wrap items-center justify-center gap-2.5 px-3'>
        {hand.map((face, i) => (
          <DiceFace
            key={`${round}-${i}`}
            face={face}
            size={110}
            hidden={tumbling}
            className={tumbling ? 'dice-tumbling' : 'dice-revealed'}
            style={tumbling ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        ))}
      </View>

      {revealed && (
        <View className='flex flex-wrap items-center justify-center gap-2 px-3'>
          {summarizeHand(hand).map((row) => (
            <View key={row} className='rounded-lg bg-gray-100 px-2.5 py-1 dark:bg-gray-700'>
              <Text className='text-base font-medium text-gray-700 dark:text-gray-200'>{row}</Text>
            </View>
          ))}
        </View>
      )}

      <Text className='text-xs text-gray-400'>{tumbling ? '摇骰中…' : '你的骰子 · 点一下盖住'}</Text>
    </View>
  )
}
