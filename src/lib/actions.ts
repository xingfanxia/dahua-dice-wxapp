/**
 * room 云函数动作封装 —— 唯一调用面。
 * postAction 语义移植自 web 版 RoomClient.postAction：失败必 resync + 浮错文案，
 * stale 文案区分（"桌面有变"），10s 超时兜底防 busy 永久卡死（web 版 softlock 教训）。
 */
import Taro from '@tarojs/taro'

export type ActionResult = { ok: boolean; reason?: string; [k: string]: unknown }

const REASON_TEXT: Record<string, string> = {
  no_room: '房间不存在或已散场',
  room_full: '房间已满',
  game_in_progress: '本局已开打，等下一局',
  game_ended: '游戏已结束',
  not_owner: '只有房主可以这么做',
  not_in_room: '你不在这个房间里',
  not_your_turn: '现在不是你的回合',
  stale: '桌面有变，请再看一眼',
  invalid_code: '邀请码格式不对',
  invalid_request: '请求不合法',
  need_more_players: '至少 2 人才能开始',
  empty: '请输入昵称',
  too_long: '昵称最多 20 字',
  invalid_chars: '昵称包含非法字符',
}

export function reasonText(reason?: string): string {
  return (reason && REASON_TEXT[reason]) || '操作失败，请重试'
}

function withTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function callRoom(data: Record<string, unknown>): Promise<ActionResult> {
  try {
    const res = await withTimeout(Taro.cloud.callFunction({ name: 'room', data }))
    return ((res as { result?: unknown }).result ?? { ok: false, reason: 'empty_result' }) as ActionResult
  } catch {
    return { ok: false, reason: 'network' }
  }
}

export const createRoom = (nick: string, avatarUrl: string) =>
  callRoom({ op: 'create', nick, avatarUrl })

export const fetchStats = () => callRoom({ op: 'stats' })

/** act 动作：成功 true；失败自动 resync + 返回给调用方浮错 */
export async function postAction(
  action: Record<string, unknown>,
  resync: () => Promise<void>,
  flash: (msg: string) => void,
): Promise<boolean> {
  const res = await callRoom({ op: 'act', action })
  if (res.ok) return true
  await resync().catch(() => {})
  flash(reasonText(res.reason))
  return false
}
