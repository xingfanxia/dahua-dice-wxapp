/** 头像徽章：有微信头像（云 fileID / URL）显示图片，否则昵称首字。简洁版（设计 §5.1）。 */
import { Image, Text, View } from '@tarojs/components'

export function AvatarBadge({ url, nick, size = 'md' }: { url?: string; nick: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8'
  if (url) {
    return <Image src={url} mode='aspectFill' className={`${cls} rounded-full bg-gray-200 dark:bg-gray-700`} />
  }
  return (
    <View className={`${cls} flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600`}>
      <Text className={`${size === 'lg' ? 'text-lg' : 'text-xs'} text-gray-600 dark:text-gray-200`}>
        {(nick || '?').slice(0, 1)}
      </Text>
    </View>
  )
}
