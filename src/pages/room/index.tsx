/**
 * 房间页 —— web 版 RoomClient 的移植（phase 驱动）+ 设计 §5.4/§5.5 全量交互态：
 * 卡片直达首次进房昵称 sheet（不弹回首页）/ join 失败三态全屏 / 出局观战横幅 /
 * staleness 驱动断线 UI（铁律 6）/ 分享卡片自动 join / BidPanel key={round} 防跨轮残留。
 */
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BidChain } from '@/components/game/BidChain'
import { BidPanel } from '@/components/game/BidPanel'
import { DiceRow } from '@/components/game/DiceRow'
import { PlayerRing } from '@/components/game/PlayerRing'
import { RevealStage } from '@/components/game/RevealStage'
import { AvatarBadge } from '@/components/game/AvatarBadge'
import { useRoomSyncCloud, fetchMyHand } from '@/hooks/useRoomSyncCloud'
import { useThemeMode } from '@/hooks/useThemeMode'
import { callRoom, postAction, reasonText } from '@/lib/actions'
import { getProfile, setProfile, uploadAvatar } from '@/lib/profile'
import type { Bid } from '@/lib/game-engine/types'

const STALE_BANNER_MS = 10_000
const STALE_OVERLAY_MS = 30_000

type JoinState =
  | { kind: 'need_profile' }
  | { kind: 'joining' }
  | { kind: 'joined'; playerId: string }
  | { kind: 'failed'; reason: string }

export default function Room() {
  const router = useRouter()
  const code = (router.params.code ?? '').toUpperCase()
  const { themeClass } = useThemeMode()
  const sync = useRoomSyncCloud(code || null)
  const state = sync.state

  const [join, setJoin] = useState<JoinState>(() => (getProfile() ? { kind: 'joining' } : { kind: 'need_profile' }))
  const [flash, setFlash] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashMsg = useCallback((msg: string) => {
    setFlash(msg)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 3000)
  }, [])

  // staleness 时钟（1s tick 驱动横幅/遮罩判定）
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const staleFor = nowTick - sync.lastSyncAt

  // 分享卡片：path 带房间码 → 接收方 onLoad 自动 join（本项目存在的理由）
  useShareAppMessage(() => ({
    title: `来玩大话骰 · 房间 ${code} 等你`,
    path: `/pages/room/index?code=${code}`,
  }))

  // join 流程：资料就绪即发 join；rejoined 也走同一路径
  const doJoin = useCallback(async () => {
    const profile = getProfile()
    if (!profile) {
      setJoin({ kind: 'need_profile' })
      return
    }
    setJoin({ kind: 'joining' })
    const res = await callRoom({
      op: 'act',
      action: { type: 'join', code, nick: profile.nick, avatarUrl: profile.avatarUrl },
    })
    if (res.ok) {
      setJoin({ kind: 'joined', playerId: res.playerId as string })
      await sync.resync()
    } else if (res.reason === 'game_in_progress') {
      // 已开打：只读观战预览 + 等下一局（设计 §5.4 三态③）—— 仍算"进了房"但没座位
      setJoin({ kind: 'failed', reason: 'game_in_progress' })
    } else {
      setJoin({ kind: 'failed', reason: res.reason ?? 'network' })
    }
  }, [code, sync.resync])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (code && getProfile()) void doJoin()
  }, [code])

  // 我的手牌：round 变化拉取；出局停拉（web 版 404 轰炸教训）；round 标签防旧响应覆写
  const myId = join.kind === 'joined' ? join.playerId : null
  const me = state?.players.find((p) => p.id === myId)
  const [hand, setHand] = useState<number[] | null>(null)
  const lastHandRoundRef = useRef(0)
  useEffect(() => {
    if (!state || !myId) return
    if (state.phase !== 'bidding' && state.phase !== 'reveal') return
    if (lastHandRoundRef.current === state.round) return
    setHand(null)
    if (!me?.alive) return
    const fetchedRound = state.round
    fetchMyHand(code).then((d) => {
      if (d.ok && d.round === fetchedRound && d.dice) {
        lastHandRoundRef.current = fetchedRound
        setHand(d.dice)
      }
    })
  }, [state, myId, me?.alive, code])

  const [busy, setBusy] = useState(false)
  const act = useCallback(
    async (action: Record<string, unknown>) => {
      setBusy(true)
      try {
        await postAction(action, sync.resync, flashMsg)
      } finally {
        setBusy(false)
      }
    },
    [sync.resync, flashMsg],
  )

  // ---------- 渲染 ----------

  const shell = (children: React.ReactNode) => (
    <View className={themeClass}>
      <View className='flex min-h-screen flex-col gap-4 bg-gray-50 px-4 pb-8 pt-4 dark:bg-gray-900'>{children}</View>
    </View>
  )

  if (!code) return shell(<FullPage emoji='🤔' title='没有房间码' action='回首页' onAction={() => Taro.reLaunch({ url: '/pages/index/index' })} />)

  // 昵称 sheet（卡片直达首次进房 —— 不弹回首页，断链会杀死分享流）
  if (join.kind === 'need_profile') {
    return shell(<NicknameSheet code={code} onDone={doJoin} />)
  }

  // join 三态全屏（保留房间码方便口头对码）
  if (join.kind === 'failed') {
    if (join.reason === 'game_in_progress' && state) {
      return shell(
        <>
          <RoomHeader code={code} staleFor={staleFor} />
          <View className='rounded-xl bg-amber-100 px-3 py-2 dark:bg-amber-900'>
            <Text className='text-sm text-amber-700 dark:text-amber-200'>本局已开打 · 你在观战，等下一局自动可加入</Text>
          </View>
          <PlayerRing state={state} myId={null} />
          {state.phase === 'bidding' && <BidChain state={state} />}
          <WaitNextGame code={code} onRetry={doJoin} state={state} />
        </>,
      )
    }
    const map: Record<string, { emoji: string; title: string }> = {
      no_room: { emoji: '🌬️', title: '房间已散场' },
      room_full: { emoji: '🈵', title: '房间满员' },
    }
    const info = map[join.reason] ?? { emoji: '⚠️', title: reasonText(join.reason) }
    return shell(
      <FullPage
        emoji={info.emoji}
        title={info.title}
        sub={`房间码 ${code}`}
        action='创建新房间'
        onAction={() => Taro.reLaunch({ url: '/pages/index/index' })}
        secondary='重试'
        onSecondary={doJoin}
      />,
    )
  }

  if (!state || join.kind === 'joining') {
    if (sync.fatal) {
      return shell(
        <FullPage emoji='🌬️' title='房间已散场' sub={`房间码 ${code}`} action='创建新房间' onAction={() => Taro.reLaunch({ url: '/pages/index/index' })} />,
      )
    }
    return shell(
      <View className='flex flex-1 flex-col items-center justify-center gap-3'>
        <Text className='text-4xl'>🎲</Text>
        <Text className='text-sm text-gray-500'>正在进入房间 {code}…</Text>
      </View>,
    )
  }

  // 断线全屏遮罩（>30s）
  if (staleFor > STALE_OVERLAY_MS) {
    return shell(
      <FullPage emoji='📡' title='同步中断' sub='与房间失去联系超过 30 秒' action='重新进入' onAction={() => {
        void sync.resync()
        void doJoin()
      }} />,
    )
  }

  const isOwner = state.ownerId === myId
  const alivePlayers = state.players.filter((p) => p.alive).length
  const isMyTurn = state.players[state.currentTurnIdx]?.id === myId

  return shell(
    <>
      <RoomHeader code={code} staleFor={staleFor} />
      {!!flash && (
        <View className='rounded-lg bg-red-100 py-1.5 text-center dark:bg-red-950'>
          <Text className='text-xs text-red-600 dark:text-red-300'>{flash}</Text>
        </View>
      )}

      {state.phase === 'lobby' ? (
        <LobbyView state={state} myId={myId} isOwner={isOwner} busy={busy} code={code}
          onStart={() => act({ type: 'start', code })}
          onLeave={async () => {
            await act({ type: 'leave', code })
            Taro.reLaunch({ url: '/pages/index/index' })
          }}
        />
      ) : (
        <>
          <PlayerRing state={state} myId={myId} />
          {state.phase === 'bidding' && <BidChain state={state} />}
          {me?.alive && state.phase !== 'game_end' && <DiceRow hand={hand} round={state.round} />}
          {me && !me.alive && state.phase !== 'game_end' && (
            <View className='rounded-lg bg-gray-100 py-1.5 text-center dark:bg-gray-800'>
              <Text className='text-xs text-gray-500'>💀 你已出局 · 观战中</Text>
            </View>
          )}

          {state.phase === 'bidding' &&
            (isMyTurn ? (
              <BidPanel
                key={state.round}
                state={state}
                alivePlayers={alivePlayers}
                busy={busy}
                onBid={(bid: Bid) => act({ type: 'bid', code, ...bid, expectedVersion: state.version })}
                onChallenge={() => act({ type: 'challenge', code, expectedVersion: state.version })}
                onPi={(targetPlayerId) => act({ type: 'pi', code, targetPlayerId, expectedVersion: state.version })}
                onTongsha={() => act({ type: 'tongsha', code, expectedVersion: state.version })}
              />
            ) : (
              <Text className='block text-center text-sm text-gray-500'>
                {state.players[state.currentTurnIdx]?.nick ?? '?'} 思考中…
              </Text>
            ))}

          {state.phase === 'reveal' && (
            <>
              <RevealStage state={state} hands={state.revealedHands ?? null} myId={myId} />
              {state.lastChallengeResult && (
                <View
                  className={`rounded-2xl bg-red-500 py-3 text-center ${busy ? 'opacity-40' : ''}`}
                  onClick={() => !busy && act({ type: 'nextRound', code, expectedVersion: state.version })}
                >
                  <Text className='font-medium text-white'>
                    {state.lastChallengeResult.gameEnded ? '查看最终结果' : '下一局'}
                  </Text>
                </View>
              )}
            </>
          )}

          {state.phase === 'game_end' && (
            <View className='mt-4 flex flex-col items-center gap-3'>
              <Text className='text-xl font-bold text-gray-900 dark:text-gray-100'>游戏结束</Text>
              {state.lastChallengeResult && state.lastChallengeResult.winnerIdx >= 0 && (
                <Text className='text-lg text-amber-500'>
                  🏆 {state.players[state.lastChallengeResult.winnerIdx]?.nick ?? '?'}
                </Text>
              )}
              <View className='mt-2 flex w-full gap-3'>
                {isOwner && (
                  <View
                    className={`flex-1 rounded-2xl bg-red-500 py-3 text-center ${busy ? 'opacity-40' : ''}`}
                    onClick={() => !busy && act({ type: 'rematch', code })}
                  >
                    <Text className='font-medium text-white'>再来一局</Text>
                  </View>
                )}
                <View
                  className='flex-1 rounded-2xl bg-white py-3 text-center dark:bg-gray-800'
                  onClick={async () => {
                    await act({ type: 'leave', code })
                    Taro.reLaunch({ url: '/pages/index/index' })
                  }}
                >
                  <Text className='font-medium text-gray-500'>离开房间</Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </>,
  )
}

// ---------- 子视图 ----------

function RoomHeader({ code, staleFor }: { code: string; staleFor: number }) {
  return (
    <View className='flex flex-col gap-2'>
      <View className='flex items-center justify-between'>
        <Text className='text-lg font-bold text-gray-900 dark:text-gray-100'>房间 {code}</Text>
        <Button openType='share' className='m-0 rounded-full bg-emerald-600 px-4 py-1 text-sm leading-6 text-white after:border-0'>
          邀请微信好友
        </Button>
      </View>
      {staleFor > STALE_BANNER_MS && (
        <View className='rounded-lg bg-amber-100 py-1.5 text-center dark:bg-amber-900'>
          <Text className='text-xs text-amber-700 dark:text-amber-200'>同步中断，重连中…</Text>
        </View>
      )}
    </View>
  )
}

function LobbyView({
  state,
  myId,
  isOwner,
  busy,
  onStart,
  onLeave,
}: {
  state: NonNullable<ReturnType<typeof useRoomSyncCloud>['state']>
  myId: string | null
  isOwner: boolean
  busy: boolean
  code: string
  onStart: () => void
  onLeave: () => void
}) {
  const canStart = state.players.length >= 2
  return (
    <>
      <View className='flex flex-col gap-2'>
        <Text className='text-xs uppercase tracking-wide text-gray-400'>玩家（{state.players.length}/8）</Text>
        {state.players.map((p) => (
          <View key={p.id} className='flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-gray-800'>
            <AvatarBadge url={p.avatar} nick={p.nick} />
            <Text className='text-base text-gray-900 dark:text-gray-100'>
              {p.nick}
              {p.id === myId ? (p.id === state.ownerId ? '（你，房主）' : '（你）') : p.id === state.ownerId ? '（房主）' : ''}
            </Text>
          </View>
        ))}
        {state.players.length < 2 && (
          <View className='rounded-xl border border-dashed border-gray-300 p-3 dark:border-gray-600'>
            <Text className='text-sm text-gray-400'>⋯ 等待玩家加入 —— 点右上「邀请微信好友」拉人</Text>
          </View>
        )}
      </View>

      <View className='flex flex-col gap-1 rounded-xl bg-white p-3 dark:bg-gray-800'>
        <Text className='text-xs uppercase tracking-wide text-gray-400'>规则</Text>
        <Text className='text-sm text-gray-700 dark:text-gray-300'>
          每人 {state.rules.diceCount} 颗 · {state.rules.aceWild ? '1点万能' : '1点不算'} ·{' '}
          {state.rules.allowZhai ? '允许斋' : '禁斋'}
          {state.rules.chineseExtensions.pi ? ' · 劈' : ''}
          {state.rules.chineseExtensions.tongsha ? ' · 通杀' : ''}
          {state.rules.paliFicoVariant ? ' · Palifico' : ''}
        </Text>
      </View>

      <View className='mt-auto flex flex-col gap-2'>
        {isOwner ? (
          <View
            className={`rounded-2xl py-4 text-center ${canStart && !busy ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            onClick={() => canStart && !busy && onStart()}
          >
            <Text className={`font-medium ${canStart ? 'text-white' : 'text-gray-400'}`}>
              {canStart ? '开始游戏' : '至少 2 人才能开始'}
            </Text>
          </View>
        ) : (
          <View className='rounded-2xl bg-white py-4 text-center dark:bg-gray-800'>
            <Text className='text-sm text-gray-400'>等待房主开始游戏…</Text>
          </View>
        )}
        <View className='py-2 text-center' onClick={onLeave}>
          <Text className='text-sm text-gray-400'>离开房间</Text>
        </View>
      </View>
    </>
  )
}

function WaitNextGame({
  code,
  onRetry,
  state,
}: {
  code: string
  onRetry: () => void
  state: { phase: string }
}) {
  // game_end / 回到 lobby 时自动重试 join（rematch 后满血回归路径）
  useEffect(() => {
    if (state.phase === 'lobby' || state.phase === 'game_end') onRetry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])
  return (
    <View className='mt-auto rounded-2xl bg-white py-3 text-center dark:bg-gray-800' onClick={onRetry}>
      <Text className='text-sm text-gray-500'>房间码 {code} · 下一局开始时点我入座</Text>
    </View>
  )
}

function NicknameSheet({ code, onDone }: { code: string; onDone: () => void }) {
  const [nick, setNick] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [err, setErr] = useState('')

  async function onChooseAvatar(e: { detail: { avatarUrl: string } }) {
    try {
      setAvatarUrl(await uploadAvatar(e.detail.avatarUrl))
    } catch {
      // 头像失败不拦路
    }
  }

  return (
    <View className='flex flex-1 flex-col justify-end'>
      <View className='flex flex-col gap-4 rounded-t-3xl bg-white p-6 pb-10 dark:bg-gray-800'>
        <Text className='text-lg font-bold text-gray-900 dark:text-gray-100'>进入房间 {code}</Text>
        <Text className='text-sm text-gray-400'>第一次来，留个名字和头像吧</Text>
        <View className='flex items-center gap-3'>
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
            placeholder='你的名字'
            placeholderClass='text-gray-400'
            className='flex-1 rounded-xl bg-gray-50 px-3 py-3 text-base text-gray-900 dark:bg-gray-700 dark:text-gray-100'
            maxlength={20}
            onInput={(e) => setNick(e.detail.value)}
          />
        </View>
        {!!err && <Text className='text-center text-sm text-red-500'>{err}</Text>}
        <View
          className='rounded-2xl bg-red-500 py-4 text-center'
          onClick={() => {
            if (!nick.trim()) {
              setErr('请输入昵称')
              return
            }
            setProfile({ nick: nick.trim(), avatarUrl })
            onDone()
          }}
        >
          <Text className='font-medium text-white'>进入房间</Text>
        </View>
      </View>
    </View>
  )
}

function FullPage({
  emoji,
  title,
  sub,
  action,
  onAction,
  secondary,
  onSecondary,
}: {
  emoji: string
  title: string
  sub?: string
  action: string
  onAction: () => void
  secondary?: string
  onSecondary?: () => void
}) {
  return (
    <View className='flex flex-1 flex-col items-center justify-center gap-3 px-8'>
      <Text className='text-5xl'>{emoji}</Text>
      <Text className='text-xl font-bold text-gray-900 dark:text-gray-100'>{title}</Text>
      {!!sub && <Text className='text-sm text-gray-400'>{sub}</Text>}
      <View className='mt-4 w-full rounded-2xl bg-red-500 py-3.5 text-center' onClick={onAction}>
        <Text className='font-medium text-white'>{action}</Text>
      </View>
      {!!secondary && (
        <View className='w-full py-2 text-center' onClick={onSecondary}>
          <Text className='text-sm text-gray-400'>{secondary}</Text>
        </View>
      )}
    </View>
  )
}
