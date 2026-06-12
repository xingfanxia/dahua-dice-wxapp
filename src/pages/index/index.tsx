import { View, Text } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import './index.scss'

export default function Index () {
  useLoad(() => {
    console.log('Page loaded.')
  })

  return (
    <View className='index flex flex-col items-center justify-center gap-4 pt-24'>
      <Text className='text-2xl font-bold text-red-500'>闹麻大话骰</Text>
      <Text className='text-sm text-gray-500'>tailwind 链路验证页（WXAPP-1）</Text>
    </View>
  )
}
