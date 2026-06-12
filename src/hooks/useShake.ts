/**
 * 摇一摇检测（weapp 版）：wx 加速度计（onDeviceMotionChange 在小程序里给的是方向角，
 * 不是加速度 —— 用 onAccelerometerChange，单位 g）。无权限弹窗。
 * 阈值 + 去抖语义对齐 web 版 useShakeDetector（强摇才触发，800ms 冷却）。
 */
import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'

const THRESHOLD_G = 1.6 // 合加速度超过 ~1.6g 视为用力摇（静置 ≈1g）
const COOLDOWN_MS = 800

export function useShake(onShake: () => void, enabled: boolean = true) {
  const onShakeRef = useRef(onShake)
  onShakeRef.current = onShake

  useEffect(() => {
    if (!enabled) return
    let lastFired = 0
    const handler = (res: { x: number; y: number; z: number }) => {
      const mag = Math.sqrt(res.x * res.x + res.y * res.y + res.z * res.z)
      const now = Date.now()
      if (mag > THRESHOLD_G && now - lastFired > COOLDOWN_MS) {
        lastFired = now
        onShakeRef.current()
      }
    }
    try {
      Taro.startAccelerometer({ interval: 'game' })
      Taro.onAccelerometerChange(handler)
    } catch {
      // 设备不支持加速度计 —— 按钮路径兜底
    }
    return () => {
      try {
        Taro.offAccelerometerChange(handler)
        Taro.stopAccelerometer()
      } catch {
        // 已停止
      }
    }
  }, [enabled])
}
