import { Text, View } from '@tarojs/components'
import type { Bid, RoomState } from '@/lib/game-engine/types'

// 移植自 web 版 components/game/BidChain.tsx（WXAPP-1 最薄链路验证版）。
// 与 web 版的差异（WXAPP-4 补齐）：i18n 硬编码 zh-CN、主题 tokens 未接（中性灰阶）、
// AvatarBadge 以首字徽章替位。结构与逻辑（cjson 空表守卫 / 最新出价高亮 / 斋徽章）保持一致。

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8']

/** 给读屏的出价文案（web 版 bidLabel 的 zh-CN 化） */
function bidLabel(bid: Bid, face: string): string {
  return `${bid.count} × ${face}${bid.isZhai ? '（斋）' : ''}`
}

export function BidChain({ state }: { state: RoomState }) {
  // Array.isArray (not ?? []): a cjson-encoded empty table arrives as {} not [].
  const chain = Array.isArray(state.bidChain) ? state.bidChain : []

  if (chain.length === 0) {
    return <Text className='block text-center text-sm text-gray-400'>等待第一口叫骰…</Text>
  }

  return (
    <View className='flex flex-col gap-2'>
      <Text className='text-xs uppercase tracking-wide text-gray-400'>本轮叫骰</Text>
      <View className='flex flex-col gap-1.5'>
        {chain.map((entry, i) => {
          const player = state.players.find((p) => p.id === entry.playerId)
          const latest = i === chain.length - 1
          const faceGlyph = DICE_GLYPHS[entry.bid.face - 1]
          return (
            <View
              key={`${entry.playerId}-${i}`}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${
                latest ? 'border border-red-300 bg-white opacity-100' : 'border border-transparent bg-gray-50 opacity-60'
              }`}
              aria-label={bidLabel(entry.bid, faceGlyph)}
            >
              <View className='flex h-6 w-6 items-center justify-center rounded-full bg-gray-200'>
                <Text className='text-xs text-gray-600'>{(player?.nick ?? '?').slice(0, 1)}</Text>
              </View>
              <Text className='text-sm text-gray-500'>{player?.nick ?? '?'}</Text>
              <View className='ml-auto flex items-center gap-1.5'>
                <Text className='text-base text-gray-900'>{entry.bid.count}</Text>
                <Text className='text-gray-400'>×</Text>
                <Text className='text-xl text-gray-900'>{faceGlyph}</Text>
                {entry.bid.isZhai && (
                  <Text className='rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600'>斋</Text>
                )}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}
