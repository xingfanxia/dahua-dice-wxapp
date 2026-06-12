/**
 * dark/light 双模式（设计 §5.1）：跟随系统为默认，手动覆盖存 storage。
 * 页面根节点挂 `dark` class → tailwind dark: variant 全局生效（@custom-variant 见 app.css）。
 */
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'
const STORAGE_KEY = 'theme-mode'

function systemTheme(): 'light' | 'dark' {
  try {
    return (Taro.getAppBaseInfo?.()?.theme ?? 'light') as 'light' | 'dark'
  } catch {
    return 'light'
  }
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      return (Taro.getStorageSync(STORAGE_KEY) as ThemeMode) || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)

  useEffect(() => {
    const handler = (res: { theme?: string }) => setSystem(res.theme === 'dark' ? 'dark' : 'light')
    Taro.onThemeChange?.(handler)
    return () => Taro.offThemeChange?.(handler)
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      Taro.setStorageSync(STORAGE_KEY, m)
    } catch {
      // storage 失败不阻断切换（仅丢持久化）
    }
  }, [])

  const resolved: 'light' | 'dark' = mode === 'auto' ? system : mode
  return { mode, setMode, resolved, themeClass: resolved === 'dark' ? 'dark' : '' }
}
