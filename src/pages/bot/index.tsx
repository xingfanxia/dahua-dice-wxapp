/**
 * 人机对战（#6）—— 本地单机对局，完整大话骰规则（飞 + 开），电脑用启发式策略出价。
 * 复用 CurrentBid / DiceRow / BidPanel / RevealStage / PlayerRing。无网络、无云依赖。
 */
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CurrentBid } from '@/components/game/CurrentBid'
import { DiceRow } from '@/components/game/DiceRow'
import { BidPanel } from '@/components/game/BidPanel'
import { PlayerRing } from '@/components/game/PlayerRing'
import { RevealStage } from '@/components/game/RevealStage'
import { useThemeMode } from '@/hooks/useThemeMode'
import { type Difficulty, botAct } from '@/lib/bot'
import {
  challengeLocal,
  createLocalGame,
  type LocalGame,
  nextRoundLocal,
  placeBidLocal,
  startLocal,
} from '@/lib/localGame'
import type { Bid } from '@/lib/game-engine/types'

const noop = () => {}

export default function Bot() {
  const { themeClass } = useThemeMode()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [diceCount, setDiceCount] = useState(5)
  const [game, setGame] = useState<LocalGame | null>(null)
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => setGame(startLocal(createLocalGame(1, diceCount)))

  // 电脑回合驱动：到电脑出价时延时 ~1s 行动（拟人节奏）
  useEffect(() => {
    if (!game || game.state.phase !== 'bidding') return
    const cur = game.state.players[game.state.currentTurnIdx]
    if (!cur || cur.id === 'me') return
    if (botTimer.current) clearTimeout(botTimer.current)
    botTimer.current = setTimeout(() => {
      const action = botAct(game.state, game.hands, cur.id, difficulty)
      if (action.type === 'challenge') {
        setGame((g) => (g ? { ...g, state: challengeLocal(g.state, g.hands, cur.id) } : g))
      } else {
        setGame((g) => (g ? { ...g, state: placeBidLocal(g.state, cur.id, action.bid) } : g))
      }
    }, 900 + Math.floor(Math.random() * 700))
    return () => { if (botTimer.current) clearTimeout(botTimer.current) }
  }, [game, difficulty])

  useEffect(() => () => { if (botTimer.current) clearTimeout(botTimer.current) }, [])

  const playerBid = useCallback((bid: Bid) => {
    setGame((g) => (g ? { ...g, state: placeBidLocal(g.state, 'me', bid) } : g))
  }, [])
  const playerChallenge = useCallback(() => {
    setGame((g) => (g ? { ...g, state: challengeLocal(g.state, g.hands, 'me') } : g))
  }, [])
  const goNextRound = useCallback(() => setGame((g) => (g ? nextRoundLocal(g.state) : g)), [])

  const shell = (children: React.ReactNode) => (
    <View className={themeClass}>
      <View className='flex min-h-screen flex-col gap-4 bg-gray-50 px-4 pb-8 pt-4 dark:bg-gray-900'>
        <View className='flex items-center gap-2' onClick={() => Taro.reLaunch({ url: '/pages/index/index' })}>
          <Text className='text-sm text-gray-400'>←</Text>
          <Text className='text-lg font-bold text-gray-900 dark:text-gray-100'>人机对战</Text>
        </View>
        {children}
      </View>
    </View>
  )

  // 设置页
  if (!game) {
    return shell(
      <View className='flex flex-1 flex-col gap-5 pt-6'>
        <View className='flex flex-col gap-2 rounded-2xl bg-white p-4 dark:bg-gray-800'>
          <Text className='text-sm text-gray-700 dark:text-gray-300'>难度</Text>
          <View className='flex gap-2'>
            {([['easy', '简单'], ['medium', '中等'], ['hard', '困难']] as const).map(([k, label]) => (
              <View
                key={k}
                className={`flex-1 rounded-xl py-2.5 text-center ${difficulty === k ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'}`}
                onClick={() => setDifficulty(k)}
              >
                <Text className={`text-base font-medium ${difficulty === k ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <Picker label='每人骰子数' options={[3, 4, 5]} value={diceCount} onPick={setDiceCount} />
        <View className='mt-2 rounded-2xl bg-red-500 py-4 text-center' onClick={start}>
          <Text className='text-base font-medium text-white'>开始对战（1 个电脑）</Text>
        </View>
        <Text className='text-center text-xs text-gray-400'>规则：1 点万能（飞）· 叫数或开 · 输了减骰 · 淘汰制</Text>
      </View>,
    )
  }

  const { state, hands } = game
  const me = state.players.find((p) => p.id === 'me')
  const isMyTurn = state.players[state.currentTurnIdx]?.id === 'me'
  const alivePlayers = state.players.filter((p) => p.alive).length

  return shell(
    <>
      <PlayerRing state={state} myId='me' />

      {state.phase === 'bidding' && (
        <>
          <CurrentBid state={state} myId='me' />
          {me?.alive ? (
            <DiceRow hand={hands.me ?? null} round={state.round} />
          ) : (
            <View className='rounded-lg bg-gray-100 py-1.5 text-center dark:bg-gray-800'>
              <Text className='text-xs text-gray-500'>💀 你已出局 · 看电脑互啄</Text>
            </View>
          )}
          {me?.alive &&
            (isMyTurn ? (
              <BidPanel
                key={state.round}
                state={state}
                alivePlayers={alivePlayers}
                busy={false}
                onBid={playerBid}
                onChallenge={playerChallenge}
                onPi={noop}
                onTongsha={noop}
              />
            ) : (
              <View className='flex flex-col items-center gap-2 rounded-2xl bg-white py-6 dark:bg-gray-800'>
                <Text className='text-2xl'>🤖</Text>
                <Text className='text-base font-medium text-gray-700 dark:text-gray-200'>
                  {state.players[state.currentTurnIdx]?.nick ?? '电脑'} 思考中…
                </Text>
              </View>
            ))}
        </>
      )}

      {state.phase === 'reveal' && (
        <>
          <RevealStage key={state.round} state={state} hands={hands} myId='me' />
          {state.lastChallengeResult && (
            <View className='rounded-2xl bg-red-500 py-3.5 text-center' onClick={goNextRound}>
              <Text className='text-base font-medium text-white'>
                {state.lastChallengeResult.gameEnded ? '🏁 查看最终结果' : '▶ 下一局'}
              </Text>
            </View>
          )}
        </>
      )}

      {state.phase === 'game_end' && (
        <View className='mt-4 flex flex-col items-center gap-3'>
          <Text className='text-2xl font-bold text-gray-900 dark:text-gray-100'>游戏结束</Text>
          {state.lastChallengeResult && state.lastChallengeResult.winnerIdx >= 0 && (
            <Text className='text-xl text-amber-500'>
              🏆 {state.players[state.lastChallengeResult.winnerIdx]?.nick ?? '?'} 获胜
            </Text>
          )}
          <View className='mt-2 flex w-full flex-col gap-2.5'>
            <View className='rounded-2xl bg-red-500 py-3.5 text-center' onClick={start}>
              <Text className='text-base font-medium text-white'>🔄 再来一局</Text>
            </View>
            <View
              className='rounded-2xl border border-gray-300 py-3 text-center dark:border-gray-600'
              onClick={() => Taro.reLaunch({ url: '/pages/index/index' })}
            >
              <Text className='text-base font-medium text-gray-600 dark:text-gray-300'>← 返回首页</Text>
            </View>
          </View>
        </View>
      )}
    </>,
  )
}

function Picker({ label, options, value, onPick }: { label: string; options: number[]; value: number; onPick: (v: number) => void }) {
  return (
    <View className='flex flex-col gap-2 rounded-2xl bg-white p-4 dark:bg-gray-800'>
      <Text className='text-sm text-gray-700 dark:text-gray-300'>{label}</Text>
      <View className='flex gap-2'>
        {options.map((o) => (
          <View
            key={o}
            className={`flex-1 rounded-xl py-2.5 text-center ${value === o ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'}`}
            onClick={() => onPick(o)}
          >
            <Text className={`text-base font-medium ${value === o ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{o}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
