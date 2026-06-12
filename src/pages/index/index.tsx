import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { BidChain } from '@/components/game/BidChain'
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types'
import './index.scss'

// WXAPP-1 链路验证页：React 18 + tailwind + 引擎类型 + 移植组件渲染假数据 + 云函数 echo。
// WXAPP-4 时整页替换为真正的首页（昵称头像 + 创建/加入）。

const FAKE_STATE = {
  phase: 'bidding',
  players: [
    { id: 'p1', nick: '阿鑫', avatar: 'numeric', alive: true, diceCount: 5 },
    { id: 'p2', nick: '老王', avatar: 'numeric', alive: true, diceCount: 5 },
  ],
  bidChain: [
    { playerId: 'p1', bid: { count: 3, face: 4, isZhai: false } },
    { playerId: 'p2', bid: { count: 4, face: 4, isZhai: false } },
    { playerId: 'p1', bid: { count: 3, face: 1, isZhai: true } },
  ],
  rules: DEFAULT_RULES,
} as unknown as RoomState

export default function Index() {
  const [echo, setEcho] = useState('未调用')

  useLoad(() => {
    Taro.cloud
      .callFunction({ name: 'room', data: { action: 'echo', payload: 'WXAPP-1' } })
      .then((res) => setEcho(JSON.stringify(res.result)))
      .catch((err) => setEcho(`echo 失败: ${err.errMsg ?? err}`))
  })

  return (
    <View className='flex flex-col gap-6 px-6 pt-16'>
      <View className='flex flex-col items-center gap-1'>
        <Text className='text-2xl font-bold text-red-500'>闹麻大话骰</Text>
        <Text className='text-sm text-gray-500'>WXAPP-1 链路验证页</Text>
      </View>
      <BidChain state={FAKE_STATE} />
      <View className='flex flex-col gap-1 rounded-xl bg-gray-50 p-3'>
        <Text className='text-xs uppercase tracking-wide text-gray-400'>room 云函数 echo</Text>
        <Text className='break-all text-xs text-gray-600'>{echo}</Text>
      </View>
    </View>
  )
}
