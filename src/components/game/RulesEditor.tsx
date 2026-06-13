/**
 * 规则编辑器（WXAPP-5）—— web 版 CustomizationDrawer 的规则面板移植：
 * 骰子数 3-10（AX：上限 10）/ 1点万能 / 允许斋 / 中式扩展（劈·反劈·通杀）/ Palifico。
 * 面数固定 6（AX：8 面选项整体去掉；引擎仍兼容 6|8，仅 UI 不暴露）。
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

      <View className='flex flex-col gap-2'>
        <Text className='text-sm text-gray-700 dark:text-gray-300'>每人骰子数</Text>
        <View className='grid grid-cols-4 gap-2'>
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <View
              key={n}
              className={`rounded-xl py-2 text-center ${draft.diceCount === n ? 'bg-red-500' : 'bg-gray-100 dark:bg-gray-700'}`}
              onClick={() => patch({ diceCount: n as GameRules['diceCount'] })}
            >
              <Text className={`text-sm font-medium ${draft.diceCount === n ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                {n}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Toggle label='1 点万能（飞）' checked={draft.aceWild} onToggle={() => patch({ aceWild: !draft.aceWild })} />
      <Toggle label='允许斋（1 点不算）' checked={draft.allowZhai} onToggle={() => patch({ allowZhai: !draft.allowZhai })} />
      <Toggle
        label='失败减骰子（淘汰制）'
        sub={draft.loseDie ? '输了减一颗，减光出局' : '聚会版：不减骰、不淘汰，只决出本轮输家'}
        checked={draft.loseDie}
        onToggle={() => patch({ loseDie: !draft.loseDie })}
      />
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



function Toggle({ label, sub, checked, onToggle }: { label: string; sub?: string; checked: boolean; onToggle: () => void }) {
  return (
    <View className='flex items-center justify-between gap-3' onClick={onToggle}>
      <View className='flex-1'>
        <Text className='block text-sm text-gray-700 dark:text-gray-300'>{label}</Text>
        {!!sub && <Text className='block text-xs text-gray-400'>{sub}</Text>}
      </View>
      <View className={`h-7 w-12 shrink-0 rounded-full p-0.5 ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <View className={`h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </View>
    </View>
  )
}
