// 渲染冒烟（不依赖云端新函数）：首页渲染 + 资料持久化 + 房间页进入态/昵称 sheet。
// 完整 UI 旅程（建房→lobby→规则→三态）见 wxapp4-smoke.mjs（需云函数部署）。
// 运行：node scripts/smoke/wxapp1-smoke.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'

const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = false
const check = (cond, msg) => {
  if (!cond) {
    failed = true
    console.error('FAIL:', msg)
  } else {
    console.log('ok:', msg)
  }
}

const miniProgram = await automator.launch({ cliPath: CLI, projectPath })
try {
  // 首页（无资料态）
  await miniProgram.callWxMethod('removeStorageSync', 'profile')
  let page = await miniProgram.reLaunch('/pages/index/index')
  await sleep(1200)
  let texts = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
  check(texts.includes('闹麻大话骰'), 'home title 渲染')
  check(texts.includes('创建房间'), 'create 按钮在')
  check(texts.some((t) => t.includes('跟随系统') || t.includes('深色') || t.includes('浅色')), '主题开关在')

  // 房间页（无资料 → 昵称 sheet，卡片直达 journey 的第一屏）
  page = await miniProgram.reLaunch('/pages/room/index?code=ABCDEF')
  await sleep(1500)
  texts = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
  check(texts.some((t) => t.includes('第一次来，留个名字和头像吧')), '昵称 sheet（卡片直达不弹回首页）')

  // 房间页（有资料 → joining/同步流转，不崩即可；云端新函数未部署时停在错误/spinner 态都接受）
  await miniProgram.callWxMethod('setStorageSync', 'profile', { nick: '冒烟员', avatarUrl: '' })
  page = await miniProgram.reLaunch('/pages/room/index?code=ABCDEF')
  await sleep(2500)
  texts = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
  check(texts.length > 0, '房间页有渲染（未白屏）')
  console.log('room page state:', texts.join('|').slice(0, 160))

  console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS')
  process.exitCode = failed ? 1 : 0
} finally {
  // close 偶发 Connection closed（IDE 已自行退出）—— 不让收尾噪音盖过真实结果
  await miniProgram.close().catch(() => {})
}
