/**
 * 首页：微信资料（官方填写能力：open-type=chooseAvatar + input type=nickname）+
 * 创建/加入房间 + 我的战绩卡片（openid 维度，AX 指示）+ dark/light 开关（设计 §5.1）。
 */
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { AvatarBadge } from '@/components/game/AvatarBadge'
import { useThemeMode } from '@/hooks/useThemeMode'
import { createRoom, fetchStats, reasonText } from '@/lib/actions'
import { getProfile, setProfile, uploadAvatar } from '@/lib/profile'

type Stats = { gamesPlayed: number; wins: number; challengesWon: number; challengesLost: number }

export default function Index() {
  const { mode, setMode, themeClass } = useThemeMode()
  const [nick, setNick] = useState(() => getProfile()?.nick ?? '')
  const [avatarUrl, setAvatarUrl] = useState(() => getProfile()?.avatarUrl ?? '')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)

  useDidShow(() => {
    fetchStats().then((r) => {
      if (r.ok && r.stats) setStats(r.stats as Stats)
    })
  })

  function saveProfile(n: string, a: string) {
    if (n.trim()) setProfile({ nick: n.trim(), avatarUrl: a })
  }

  async function onChooseAvatar(e: { detail: { avatarUrl: string } }) {
    try {
      const fileID = await uploadAvatar(e.detail.avatarUrl)
      setAvatarUrl(fileID)
      saveProfile(nick, fileID)
    } catch {
      setError('头像上传失败，可以先不设置')
    }
  }

  async function onCreate() {
    const n = nick.trim()
    if (!n) {
      setError('请输入昵称')
      return
    }
    saveProfile(n, avatarUrl)
    setBusy(true)
    setError('')
    try {
      const res = await createRoom(n, avatarUrl)
      if (!res.ok) {
        setError(reasonText(res.reason))
        return
      }
      Taro.navigateTo({ url: `/pages/room/index?code=${res.code}` })
    } finally {
      setBusy(false)
    }
  }

  function onJoin() {
    const n = nick.trim()
    if (!n) {
      setError('请输入昵称')
      return
    }
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      setError('邀请码必须 6 位')
      return
    }
    saveProfile(n, avatarUrl)
    Taro.navigateTo({ url: `/pages/room/index?code=${code}` })
  }

  return (
    <View className={themeClass}>
      <View className='flex min-h-screen flex-col gap-6 bg-gray-50 px-6 pb-10 pt-12 dark:bg-gray-900'>
        {/* 标题 + 主题开关 */}
        <View className='flex items-center justify-between'>
          <View>
            <Text className='block text-3xl font-bold text-gray-900 dark:text-gray-50'>闹麻大话骰</Text>
            <Text className='block text-sm text-gray-400'>Liar&apos;s Dice · 群里开摇</Text>
          </View>
          <View
            className='rounded-full bg-white px-3 py-1.5 dark:bg-gray-800'
            onClick={() => setMode(mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto')}
          >
            <Text className='text-sm text-gray-600 dark:text-gray-300'>
              {mode === 'auto' ? '🌗 跟随系统' : mode === 'dark' ? '🌙 深色' : '☀️ 浅色'}
            </Text>
          </View>
        </View>

        {/* 微信资料 */}
        <View className='flex items-center gap-3 rounded-2xl bg-white p-4 dark:bg-gray-800'>
          <Button
            openType='chooseAvatar'
            onChooseAvatar={onChooseAvatar}
            className='m-0 flex items-center justify-center border-0 bg-transparent p-0 leading-none after:border-0'
          >
            <AvatarBadge url={avatarUrl} nick={nick || '?'} size='lg' />
          </Button>
          <Input
            type='nickname'
            value={nick}
            placeholder='你的名字（可一键用微信昵称）'
            placeholderClass='text-gray-400'
            className='flex-1 text-base text-gray-900 dark:text-gray-100'
            maxlength={20}
            onInput={(e) => setNick(e.detail.value)}
            onBlur={(e) => {
              setNick(e.detail.value)
              saveProfile(e.detail.value, avatarUrl)
            }}
          />
        </View>

        {/* 创建 / 加入 */}
        <View className='flex flex-col gap-3'>
          <View
            className={`rounded-2xl bg-red-500 py-4 text-center ${busy ? 'opacity-40' : ''}`}
            onClick={() => !busy && onCreate()}
          >
            <Text className='text-base font-medium text-white'>创建房间</Text>
          </View>
          <View className='flex gap-2'>
            <Input
              value={joinCode}
              placeholder='输入 6 位邀请码'
              placeholderClass='text-gray-400'
              className='flex-1 rounded-2xl bg-white px-4 py-3.5 text-base uppercase tracking-widest text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              maxlength={6}
              onInput={(e) => setJoinCode(e.detail.value)}
            />
            <View className='rounded-2xl bg-gray-900 px-6 py-3.5 text-center dark:bg-gray-700' onClick={onJoin}>
              <Text className='text-base font-medium text-white'>进入</Text>
            </View>
          </View>
          {!!error && <Text className='block text-center text-sm text-red-500'>{error}</Text>}
        </View>

        {/* 我的战绩（openid 维度，stats 集合） */}
        {stats && stats.gamesPlayed > 0 && (
          <View className='flex flex-col gap-2 rounded-2xl bg-white p-4 dark:bg-gray-800'>
            <Text className='text-xs uppercase tracking-wide text-gray-400'>我的战绩</Text>
            <View className='flex justify-between'>
              <StatCell label='场次' value={stats.gamesPlayed} />
              <StatCell label='夺冠' value={stats.wins} />
              <StatCell label='开对' value={stats.challengesWon} />
              <StatCell label='被开' value={stats.challengesLost} />
            </View>
          </View>
        )}

        <Text className='mt-auto block text-center text-xs text-gray-300 dark:text-gray-600'>
          朋友间体验版 · 不会上架 · 玩得开心
        </Text>
      </View>
    </View>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <View className='flex flex-col items-center gap-0.5'>
      <Text className='text-2xl font-bold text-gray-900 dark:text-gray-100'>{value}</Text>
      <Text className='text-xs text-gray-400'>{label}</Text>
    </View>
  )
}
