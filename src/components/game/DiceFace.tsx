/**
 * 骰子单面 —— 用定位圆点 View 拼出立体骰子（weapp 无内联 SVG；圆点方案清晰可缩放，
 * 比 emoji ⚀⚁ 真实得多）。白色骰身 + 圆角 + 阴影 + 渐变；传统中式 1/4 点红色。
 * size = 骰身边长（rpx）。hidden = 盖住态（显示骰背，不露点数）。
 */
import { Text, View } from '@tarojs/components'
import type { CSSProperties } from 'react'

// 9 宫格点位（行优先）：0=左上 1=上中 2=右上 3=左中 4=中 5=右中 6=左下 7=下中 8=右下
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function DiceFace({
  face,
  size = 96,
  hidden = false,
  className,
  style,
}: {
  face: number
  size?: number
  hidden?: boolean
  className?: string
  style?: CSSProperties
}) {
  const body: CSSProperties = {
    width: `${size}rpx`,
    height: `${size}rpx`,
    borderRadius: `${Math.round(size * 0.2)}rpx`,
    background: hidden
      ? 'linear-gradient(160deg, #f3f4f6 0%, #d1d5db 100%)'
      : 'linear-gradient(160deg, #ffffff 0%, #e9eaee 100%)',
    boxShadow: `0 ${Math.round(size * 0.05)}rpx ${Math.round(size * 0.12)}rpx rgba(0,0,0,0.18), inset 0 ${Math.round(size * 0.03)}rpx ${Math.round(size * 0.05)}rpx rgba(255,255,255,0.9)`,
    padding: `${Math.round(size * 0.14)}rpx`,
    boxSizing: 'border-box',
    ...style,
  }

  if (hidden) {
    return (
      <View className={className} style={body}>
        <View className='flex h-full w-full items-center justify-center'>
          <View
            style={{
              width: `${Math.round(size * 0.22)}rpx`,
              height: `${Math.round(size * 0.22)}rpx`,
              borderRadius: '50%',
              border: `${Math.max(2, Math.round(size * 0.02))}rpx solid #9ca3af`,
            }}
          />
        </View>
      </View>
    )
  }

  const pips = PIPS[face]
  if (!pips) {
    // 7/8 面（引擎仍支持，UI 已去）：退化为数字
    return (
      <View className={className} style={body}>
        <View className='flex h-full w-full items-center justify-center'>
          <Text style={{ fontSize: `${Math.round(size * 0.5)}rpx`, fontWeight: 700, color: '#1f2937' }}>{face}</Text>
        </View>
      </View>
    )
  }

  const pipColor = face === 1 || face === 4 ? '#dc2626' : '#1f2937'
  const pipSize = Math.round(size * 0.2)

  return (
    <View className={className} style={body}>
      <View
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          width: '100%',
          height: '100%',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} className='flex items-center justify-center'>
            {pips.includes(i) && (
              <View
                style={{
                  width: `${pipSize}rpx`,
                  height: `${pipSize}rpx`,
                  borderRadius: '50%',
                  background: pipColor,
                  boxShadow: 'inset 0 1rpx 2rpx rgba(0,0,0,0.35)',
                }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  )
}
