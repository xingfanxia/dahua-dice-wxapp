/**
 * 叫骰面板 —— 逻辑逐条移植自 web 版 BidPanel（视觉按 §5.1 简化，键盘操作不适用小程序砍掉）：
 * count 步进 / 点数宫格 / 斋勾选（叫1必斋）/ Palifico 数量锁 / isValidBid 实时校验 +
 * 中文错误提示 / 开二次确认防误触 / 劈目标选择（跳过上家与自己）/ 通杀（仅存在活着的对手叫骰者）。
 */
import { Text, View } from '@tarojs/components'
import { useMemo, useState } from 'react'
import type { Bid, Face, Player, RoomState } from '@/lib/game-engine/types'
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate'
import { AvatarBadge } from './AvatarBadge'

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8']

const REASON_TEXT: Record<string, string> = {
  zhai_disabled: '本桌禁斋',
  invalid_count: '数量必须为正整数',
  invalid_face: '无效点数',
  count_exceeds_dice: '数量不能超过场上骰子总数',
  break_zhai_needs_2x: '破斋需 2 倍以上',
  face_one_must_zhai: '叫 1 点必须斋叫',
  palifico_count_locked: 'Palifico 回合数量锁定，只能加点数',
  not_higher: '必须高于上家',
}

export function BidPanel({
  state,
  alivePlayers,
  busy,
  onBid,
  onChallenge,
  onPi,
  onTongsha,
}: {
  state: RoomState
  alivePlayers: number
  busy: boolean
  onBid: (bid: Bid) => void
  onChallenge: () => void
  onPi: (targetId: string) => void
  onTongsha: () => void
}) {
  const rules = state.rules
  const palifico = state.palificoActive ?? false
  const chain = Array.isArray(state.bidChain) ? state.bidChain : []
  const meId = state.players[state.currentTurnIdx]?.id ?? null
  const standingOwner = chain.length ? chain[chain.length - 1].playerId : null

  // 劈：可劈任何「活着、在链上、非上家、非自己」的叫骰者
  const piTargets: Player[] =
    rules.chineseExtensions.pi && state.lastBid
      ? [...new Set(chain.map((e) => e.playerId))]
          .filter((id) => id !== standingOwner && id !== meId)
          .map((id) => state.players.find((p) => p.id === id))
          .filter((p): p is Player => !!p && p.alive)
      : []
  const canTongsha =
    rules.chineseExtensions.tongsha &&
    !!state.lastBid &&
    [...new Set(chain.map((e) => e.playerId))].some((id) => {
      if (id === meId) return false
      const p = state.players.find((pl) => pl.id === id)
      return !!p && p.alive
    })

  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0)
  const initialCount = palifico
    ? (state.lastBid?.count ?? alivePlayers)
    : state.lastBid
      ? state.lastBid.count + 1
      : getStartingBidThreshold(alivePlayers, false, rules, totalDice)
  const [count, setCount] = useState(initialCount)
  const [face, setFace] = useState<Face>(state.lastBid?.face ?? 4)
  const [zhaiChecked, setZhaiChecked] = useState(state.lastBid?.isZhai ?? false)
  const [piOpen, setPiOpen] = useState(false)
  const [challengePending, setChallengePending] = useState(false)

  // 叫1必斋（非 Palifico）；Palifico 回合 1 点本来就不万能
  const isZhai = palifico ? false : face === 1 ? true : zhaiChecked
  const countLocked = palifico && !!state.lastBid

  const candidate: Bid = useMemo(() => ({ count, face, isZhai }), [count, face, isZhai])
  const validation = isValidBid(state.lastBid, candidate, rules, alivePlayers, { totalDice, palifico })

  const invalidText = !validation.ok
    ? validation.reason === 'below_starting'
      ? `首叫至少 ${getStartingBidThreshold(alivePlayers, isZhai, rules, totalDice)} 个`
      : REASON_TEXT[validation.reason ?? ''] || '无效叫数'
    : null

  return (
    <View className='flex flex-col gap-4 rounded-2xl bg-white p-4 dark:bg-gray-800'>
      {palifico && (
        <Text className='block rounded-xl bg-amber-100 px-3 py-2 text-center text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-200'>
          Palifico 回合 · 1 点不算 · 数量锁定 · 只能加点数
        </Text>
      )}

      {state.lastBid && (
        <Text className='text-sm text-gray-500 dark:text-gray-400'>
          上家叫: {state.lastBid.count} 个 {DICE_GLYPHS[state.lastBid.face - 1]}
          {state.lastBid.isZhai ? ' · 斋' : ''}
        </Text>
      )}

      {/* 数量步进 */}
      <View className='flex items-center justify-between'>
        <Text className='text-xs tracking-wide text-gray-400'>数量</Text>
        <View className='flex items-center gap-4'>
          <View
            className={`flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 ${countLocked ? 'opacity-30' : ''}`}
            onClick={() => !countLocked && setCount((c) => Math.max(1, c - 1))}
          >
            <Text className='text-xl text-gray-900 dark:text-gray-100'>−</Text>
          </View>
          <Text className='min-w-12 text-center text-3xl font-bold text-gray-900 dark:text-gray-100'>{count}</Text>
          <View
            className={`flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 ${countLocked ? 'opacity-30' : ''}`}
            onClick={() => !countLocked && setCount((c) => c + 1)}
          >
            <Text className='text-xl text-gray-900 dark:text-gray-100'>+</Text>
          </View>
        </View>
      </View>

      {/* 点数宫格 */}
      <View className='flex flex-col gap-2'>
        <Text className='text-xs tracking-wide text-gray-400'>点数</Text>
        <View className='grid grid-cols-6 gap-2'>
          {Array.from({ length: rules.diceSides }, (_, i) => (i + 1) as Face).map((f) => {
            const disabled = f === 1 && !rules.allowZhai && !palifico
            const active = face === f
            return (
              <View
                key={f}
                className={`flex aspect-square min-h-11 items-center justify-center rounded-xl ${
                  active ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'
                } ${disabled ? 'opacity-30' : ''}`}
                onClick={() => !disabled && setFace(f)}
              >
                <Text className={`text-2xl ${active ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                  {DICE_GLYPHS[f - 1]}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* 斋 */}
      {rules.allowZhai && !palifico && (
        <View className='flex items-center gap-2' onClick={() => face !== 1 && setZhaiChecked((z) => !z)}>
          <View
            className={`flex h-5 w-5 items-center justify-center rounded border ${
              isZhai ? 'border-amber-500 bg-amber-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {isZhai && <Text className='text-xs text-white'>✓</Text>}
          </View>
          <Text className='text-sm text-gray-900 dark:text-gray-100'>
            斋叫（1 点不算）{face === 1 ? ' · 1 点必斋' : ''}
          </Text>
        </View>
      )}

      {/* 主操作 */}
      <View className='mt-1 flex gap-3'>
        <View
          className={`flex-1 rounded-2xl py-3.5 text-center ${
            busy || !validation.ok ? 'bg-emerald-600 opacity-40' : 'bg-emerald-600'
          }`}
          onClick={() => !busy && validation.ok && onBid(candidate)}
        >
          <Text className='font-medium text-white'>
            叫 {count} 个 {DICE_GLYPHS[face - 1]}
          </Text>
        </View>
        {state.lastBid && (
          <View
            className={`flex-1 rounded-2xl bg-red-500 py-3.5 text-center ${busy ? 'opacity-40' : ''}`}
            onClick={() => !busy && setChallengePending(true)}
          >
            <Text className='font-medium text-white'>开</Text>
          </View>
        )}
      </View>

      {/* 开确认（防误触，web 版继承） */}
      {challengePending && state.lastBid && (
        <View className='flex items-center gap-2 rounded-2xl bg-red-50 p-3 dark:bg-red-950'>
          <Text className='flex-1 text-sm text-red-600 dark:text-red-300'>确定开牌？</Text>
          <View className='min-h-11 rounded-xl px-4 py-2.5' onClick={() => setChallengePending(false)}>
            <Text className='text-sm text-gray-500'>取消</Text>
          </View>
          <View
            className={`min-h-11 rounded-xl bg-red-500 px-4 py-2.5 ${busy ? 'opacity-40' : ''}`}
            onClick={() => {
              if (busy) return
              setChallengePending(false)
              onChallenge()
            }}
          >
            <Text className='text-sm font-medium text-white'>确认开!</Text>
          </View>
        </View>
      )}

      {/* 中式扩展 */}
      {(piTargets.length > 0 || canTongsha) && (
        <View className='flex gap-3'>
          {piTargets.length > 0 && (
            <View
              className={`flex-1 rounded-2xl border border-amber-400 py-3 text-center ${busy ? 'opacity-40' : ''}`}
              onClick={() => !busy && setPiOpen((o) => !o)}
            >
              <Text className='text-sm font-medium text-amber-600'>劈</Text>
            </View>
          )}
          {canTongsha && (
            <View
              className={`flex-1 rounded-2xl border border-red-400 py-3 text-center ${busy ? 'opacity-40' : ''}`}
              onClick={() => !busy && onTongsha()}
            >
              <Text className='text-sm font-medium text-red-500'>通杀</Text>
            </View>
          )}
        </View>
      )}

      {piOpen && piTargets.length > 0 && (
        <View className='flex flex-col gap-2'>
          <Text className='text-xs text-gray-400'>劈谁？（跳过上家）</Text>
          <View className='flex flex-wrap gap-2'>
            {piTargets.map((p) => (
              <View
                key={p.id}
                className={`flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 dark:bg-gray-700 ${busy ? 'opacity-40' : ''}`}
                onClick={() => {
                  if (busy) return
                  setPiOpen(false)
                  onPi(p.id)
                }}
              >
                <AvatarBadge url={p.avatar} nick={p.nick} size='sm' />
                <Text className='text-sm text-gray-900 dark:text-gray-100'>{p.nick}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {invalidText && <Text className='block text-center text-xs text-red-500'>{invalidText}</Text>}
    </View>
  )
}
