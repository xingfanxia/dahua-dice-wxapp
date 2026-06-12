// 永久体验版小程序码（WXAPP-6）：云调用 wxacode.getUnlimited（env_version: trial）。
// 产出 buffer 存云存储并返回 fileID —— 群公告挂码用。需 config.json 声明 openapi 权限。
const cloud = require('wx-server-sdk')

// EnvId 显式写死（铁律 10）
cloud.init({ env: 'cloud1-d5gfumwck6e89f9e6' })

exports.main = async (event) => {
  const scene = String(event?.scene ?? 'home')
  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/index/index',
      checkPath: false, // 体验版路径还没发布版可校验
      envVersion: 'trial',
      width: 430,
    })
    const upload = await cloud.uploadFile({
      cloudPath: `qrcode/trial-${scene}-${Date.now()}.png`,
      fileContent: res.buffer,
    })
    return { ok: true, fileID: upload.fileID }
  } catch (err) {
    return { ok: false, reason: String((err && err.errMsg) || err) }
  }
}
