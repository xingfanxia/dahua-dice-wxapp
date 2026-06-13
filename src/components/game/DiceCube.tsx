/**
 * CSS 3D 立方体骰子（#9，AX/web 选定方案）—— weapp 支持 transform-style:preserve-3d。
 * 微倾以同时露出正/顶/右三面 → 真实立体感，正面始终是点数值（保证可读）。中式 1/4 红点。
 * 顶/右为装饰面（不影响读数）。tumble 由外层 2D 关键帧驱动（见 DiceRow.scss），稳健不卡。
 */
import { View } from '@tarojs/components'
import type { CSSProperties } from 'react'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function PipFace({ face, size, hidden }: { face: number; size: number; hidden?: boolean }) {
  const pips = hidden ? [] : (PIPS[face] ?? [])
  const pipColor = face === 1 || face === 4 ? '#dc2626' : '#1f2937'
  const pipSize = Math.round(size * 0.18)
  return (
    <View
      style={{
        width: `${size}rpx`,
        height: `${size}rpx`,
        padding: `${Math.round(size * 0.13)}rpx`,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {pips.includes(i) && (
            <View style={{ width: `${pipSize}rpx`, height: `${pipSize}rpx`, borderRadius: '50%', background: pipColor, boxShadow: 'inset 0 1rpx 2rpx rgba(0,0,0,0.3)' }} />
          )}
        </View>
      ))}
      {hidden && (
        <View style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: `${Math.round(size * 0.2)}rpx`, height: `${Math.round(size * 0.2)}rpx`, borderRadius: '50%', border: '2rpx solid #9ca3af' }} />
        </View>
      )}
    </View>
  )
}

export function DiceCube({
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
  const half = Math.round(size / 2)
  const radius = `${Math.round(size * 0.16)}rpx`
  const top = (face % 6) + 1
  const right = ((face + 1) % 6) + 1
  const base: CSSProperties = { position: 'absolute', top: 0, left: 0, borderRadius: radius }

  return (
    <View className={className} style={{ width: `${size}rpx`, height: `${size}rpx`, perspective: `${size * 4}rpx`, ...style }}>
      <View style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: 'rotateX(-12deg) rotateY(16deg)' }}>
        {/* 正面 = 点数值 */}
        <View style={{ ...base, background: 'linear-gradient(155deg, #ffffff 0%, #e7e8ec 100%)', boxShadow: '0 4rpx 10rpx rgba(0,0,0,0.18), inset 0 2rpx 3rpx rgba(255,255,255,0.85)', transform: `translateZ(${half}rpx)` }}>
          <PipFace face={face} size={size} hidden={hidden} />
        </View>
        {/* 顶面（偏亮） */}
        <View style={{ ...base, background: 'linear-gradient(155deg, #f6f7f9 0%, #dcdde2 100%)', transform: `rotateX(90deg) translateZ(${half}rpx)` }}>
          <PipFace face={top} size={size} hidden={hidden} />
        </View>
        {/* 右面（偏暗） */}
        <View style={{ ...base, background: 'linear-gradient(155deg, #e8eaed 0%, #c9cbd1 100%)', transform: `rotateY(90deg) translateZ(${half}rpx)` }}>
          <PipFace face={right} size={size} hidden={hidden} />
        </View>
      </View>
    </View>
  )
}
