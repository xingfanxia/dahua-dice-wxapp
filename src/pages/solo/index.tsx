/**
 * 线下 / 单机骰盅 —— 移植自 web 版 /solo：每台手机就是一只公平骰盅，
 * 面对面玩大话骰（叫骰用嘴，app 只管摇 + 看自己的牌）。无房间无网络。
 * 摇一摇或点按钮重掷；盖住防偷看（DiceRow 自带）；骰数 1-8、6/8 面。
 */
import { Text, View } from '@tarojs/components'
import { useState } from 'react'
import { DiceRow } from '@/components/game/DiceRow'
import { useShake } from '@/hooks/useShake'
import { useThemeMode } from '@/hooks/useThemeMode'
import { rollDiceClient } from '@/lib/soloRoll'

export default function Solo() {
  const { themeClass } = useThemeMode()
  const [count, setCount] = useState(5)
  const [sides, setSides] = useState<6 | 8>(6)
  const [hand, setHand] = useState<number[] | null>(null)
  const [rolls, setRolls] = useState(0)

  function roll() {
    setHand(rollDiceClient(count, sides))
    setRolls((r) => r + 1)
  }

  useShake(roll)

  return (
    <View className={themeClass}>
      <View className='flex min-h-screen flex-col gap-5 bg-gray-50 px-6 pb-10 pt-8 dark:bg-gray-900'>
        <View>
          <Text className='block text-2xl font-bold text-gray-900 dark:text-gray-50'>线下骰盅</Text>
          <Text className='block text-sm text-gray-400'>面对面玩 · 这台手机就是你的骰盅 · 摇一摇即掷</Text>
        </View>

        {hand ? (
          <DiceRow hand={hand} round={rolls} />
        ) : (
          <View className='flex h-28 items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600'>
            <Text className='text-sm text-gray-400'>点「摇骰子」或用力摇手机</Text>
          </View>
        )}

        <View className='rounded-2xl bg-red-500 py-4 text-center' onClick={roll}>
          <Text className='text-base font-medium text-white'>{hand ? '再摇一次' : '摇骰子'}</Text>
        </View>

        <View className='flex flex-col gap-3 rounded-2xl bg-white p-4 dark:bg-gray-800'>
          <View className='flex items-center justify-between'>
            <Text className='text-sm text-gray-700 dark:text-gray-300'>骰子数量</Text>
            <View className='flex gap-1.5'>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <View
                  key={n}
                  className={`min-w-8 rounded-lg px-2 py-1 text-center ${count === n ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'}`}
                  onClick={() => setCount(n)}
                >
                  <Text className={`text-sm ${count === n ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{n}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='flex items-center justify-between'>
            <Text className='text-sm text-gray-700 dark:text-gray-300'>骰子面数</Text>
            <View className='flex gap-1.5'>
              {([6, 8] as const).map((s) => (
                <View
                  key={s}
                  className={`min-w-10 rounded-lg px-2.5 py-1 text-center ${sides === s ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'}`}
                  onClick={() => setSides(s)}
                >
                  <Text className={`text-sm ${sides === s ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{s} 面</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <Text className='mt-auto block text-center text-xs text-gray-300 dark:text-gray-600'>
          本地掷骰 · 无网络也能玩 · 叫骰靠嘴，开骰靠胆
        </Text>
      </View>
    </View>
  )
}
