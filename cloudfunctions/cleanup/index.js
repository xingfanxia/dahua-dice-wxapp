// cron.cleanup — 定时清理 >24h 未活动的房间与手牌（设计 §3 TTL 替代）。
// 触发器见 config.json（每日 04:30）；也可手动调用。
const cloud = require('wx-server-sdk')

// EnvId 显式写死（铁律 10）
cloud.init({ env: 'cloud1-d5gfumwck6e89f9e6' })

const DAY_MS = 24 * 60 * 60 * 1000

exports.main = async () => {
  const db = cloud.database()
  const _ = db.command
  const cutoff = Date.now() - DAY_MS
  const rooms = await db.collection('rooms').where({ updatedAt: _.lt(cutoff) }).remove()
  const hands = await db.collection('hands').where({ updatedAt: _.lt(cutoff) }).remove()
  return { ok: true, removedRooms: rooms.stats.removed, removedHands: hands.stats.removed }
}
