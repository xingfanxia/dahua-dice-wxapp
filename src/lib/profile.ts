/** 本人资料（昵称 + 头像云文件 ID）—— storage 持久化，二次进房静默 join（设计 §5.4） */
import Taro from '@tarojs/taro'

export type Profile = { nick: string; avatarUrl: string }
const KEY = 'profile'

export function getProfile(): Profile | null {
  try {
    const p = Taro.getStorageSync(KEY) as Profile | ''
    return p && p.nick ? p : null
  } catch {
    return null
  }
}

export function setProfile(p: Profile): void {
  try {
    Taro.setStorageSync(KEY, p)
  } catch {
    // 丢持久化不致命：下次进房再填一次
  }
}

/** chooseAvatar 给的是临时文件 —— 传云存储换 fileID 才能跨端/跨次显示 */
export async function uploadAvatar(tempPath: string): Promise<string> {
  const ext = tempPath.split('.').pop() || 'png'
  const res = await Taro.cloud.uploadFile({
    cloudPath: `avatars/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`,
    filePath: tempPath,
  })
  return res.fileID
}
