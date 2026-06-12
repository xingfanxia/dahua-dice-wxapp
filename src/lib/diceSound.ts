/**
 * 摇骰音效（设计 §5.4）：InnerAudioContext 单实例复用，每次 seek(0) 重播。
 * obeyMuteSwitch 保持默认 true（跟随系统静音键）；资产 assets/audio/dice-shake.mp3
 * 经 config.copy 进包。失败静默 —— 音效缺席不值得打断游戏。
 */
import Taro from '@tarojs/taro'

let ctx: Taro.InnerAudioContext | null = null

export function playDiceSound(): void {
  try {
    if (!ctx) {
      ctx = Taro.createInnerAudioContext()
      ctx.src = '/assets/audio/dice-shake.mp3'
    }
    ctx.seek(0)
    ctx.play()
  } catch {
    ctx = null
  }
}

export function vibrate(): void {
  try {
    Taro.vibrateShort({ type: 'medium' })
  } catch {
    // 设备不支持震动 —— 忽略
  }
}
