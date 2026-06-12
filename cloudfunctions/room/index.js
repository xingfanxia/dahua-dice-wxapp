// room 云函数 — 唯一写入口（铁律 7）。WXAPP-1 仅 echo 骨架；create/get/act 在 WXAPP-2 落地。
const cloud = require('wx-server-sdk')

// EnvId 显式写死（铁律 10：不依赖 CLI/工具当前选中环境）
cloud.init({ env: 'cloud1-d5gfumwck6e89f9e6' })

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (event.action === 'echo') {
    return { ok: true, echo: event.payload ?? null, openid: OPENID }
  }
  return { ok: false, error: `unknown action: ${event.action}` }
}
