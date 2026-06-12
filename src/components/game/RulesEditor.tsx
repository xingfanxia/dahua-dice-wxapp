/**
 * 规则编辑器（WXAPP-5）—— web 版 CustomizationDrawer 的规则面板移植：
 * 骰子数 3-7 / 面数 6|8 / 1点万能 / 允许斋 / 中式扩展（劈·反劈·通杀）/ Palifico。
 * owner+lobby only；提交走 updateRules（云函数侧再校验一遍 owner/phase）。
 */
import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import type { GameRules } from '@/lib/game-engine/types'

export function RulesEditor({
  rules,
  busy,
  onSave,
  onClose,
}: {
  rules: GameRules
  busy: boolean
  onSave: (rules: GameRules) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<GameRules>(rules)
  // 抽屉开着时其他人改了规则 → 跟随服务端（web 版 drawer resync 教训）
  useEffect(() => setDraft(rules), [rules])

  const patch = (p: Partial<GameRules>) => setDraft((d) => ({ ...d, ...p }))
  const patchExt = (p: Partial<GameRules['chineseExtensions']>) =>
    setDraft((d) => ({ ...d, chineseExtensions: { ...d.chineseExtensions, ...p } }))

  return (
    <View className='flex flex-col gap-4 rounded-2xl bg-white p-4 dark:bg-gray-800'>
      <View className='flex items-center justify-between'>
        <Text className='text-base font-bold text-gray-900 dark:text-gray-100'>规则设定</Text>
        <Text className='px-2 py-1 text-sm text-gray-400' onClick={onClose}>
          收起
        </Text>
      </View>

      <Row label='每人骰子数'>
        <Segmented options={[3, 4, 5, 6, 7]} value={draft.diceCount} onPick={(v) => patch({ diceCount: v as GameRules['diceCount'] })} />
      </Row>
      <Row label='骰子面数'>
        <Segmented options={[6, 8]} value={draft.diceSides} onPick={(v) => patch({ diceSides: v as GameRules['diceSides'] })} />
      </Row>
      <Toggle label='1 点万能' checked={draft.aceWild} onToggle={() => patch({ aceWild: !draft.aceWild })} />
      <Toggle label='允许斋（1 点不算）' checked={draft.allowZhai} onToggle={() => patch({ allowZhai: !draft.allowZhai })} />
      <Toggle label='劈（指叫骰链上任意一口）' checked={draft.chineseExtensions.pi} onToggle={() => patchExt({ pi: !draft.chineseExtensions.pi })} />
      <Toggle
        label='反劈'
        checked={draft.chineseExtensions.fanpi}
        onToggle={() => patchExt({ fanpi: !draft.chineseExtensions.fanpi })}
      />
      <Toggle
        label='通杀（横扫全链）'
        checked={draft.chineseExtensions.tongsha}
        onToggle={() => patchExt({ tongsha: !draft.chineseExtensions.tongsha })}
      />
      <Toggle
        label='Palifico（剩 1 颗骰的专属回合）'
        checked={draft.paliFicoVariant}
        onToggle={() => patch({ paliFicoVariant: !draft.paliFicoVariant })}
      />

      <View
        className={`rounded-2xl bg-red-500 py-3 text-center ${busy ? 'opacity-40' : ''}`}
        onClick={() => !busy && onSave(draft)}
      >
        <Text className='font-medium text-white'>保存规则</Text>
      </View>
    </View>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className='flex items-center justify-between gap-3'>
      <Text className='text-sm text-gray-700 dark:text-gray-300'>{label}</Text>
      {children}
    </View>
  )
}

function Segmented({ options, value, onPick }: { options: number[]; value: number; onPick: (v: number) => void }) {
  return (
    <View className='flex gap-1.5'>
      {options.map((o) => (
        <View
          key={o}
          className={`min-w-10 rounded-lg px-2.5 py-1.5 text-center ${
            value === o ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'
          }`}
          onClick={() => onPick(o)}
        >
          <Text className={`text-sm ${value === o ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{o}</Text>
        </View>
      ))}
    </View>
  )
}

function Toggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <View className='flex items-center justify-between gap-3' onClick={onToggle}>
      <Text className='flex-1 text-sm text-gray-700 dark:text-gray-300'>{label}</Text>
      <View className={`h-7 w-12 rounded-full p-0.5 ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <View className={`h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </View>
    </View>
  )
}
