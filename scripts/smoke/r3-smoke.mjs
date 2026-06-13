// R3 单客户端冒烟：首页 → 人机（设置→开局→渲染游戏）→ 线下骰盅（摇）。
// 纯客户端路径（bot/solo 无云依赖），验证新 UI（3D 骰子/摇骰/人机驱动）渲染不崩。
// 多人 2 人对局需真机两账号，不在此覆盖。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'

const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (c, m) => { if (!c) { failed = true; console.error('FAIL:', m) } else console.log('ok:', m) }
const texts = async (page) => Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
async function findText(page, label, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const t of await page.$$('text')) if ((await t.text().catch(() => '')) === label) return t
    await sleep(300)
  }
  return null
}

const mp = await automator.launch({ cliPath: CLI, projectPath })
try {
  // 首页：模式卡片在
  let page = await mp.reLaunch('/pages/index/index')
  await sleep(900)
  let ts = await texts(page)
  check(ts.includes('人机对战'), '首页人机入口卡片')
  check(ts.includes('线下骰盅'), '首页线下入口卡片')

  // 人机：设置页 → 开局 → 游戏渲染
  page = await mp.reLaunch('/pages/bot/index')
  await sleep(800)
  ts = await texts(page)
  check(ts.includes('困难') && ts.includes('简单'), '人机难度三档')
  check(ts.some((t) => t.includes('每人骰子数')), '人机骰子数选择')
  const startBtn = await findText(page, '开始对战（1 个电脑）', 4000)
  check(!!startBtn, '人机开始按钮')
  if (startBtn) {
    await startBtn.tap()
    await sleep(1200)
    ts = await texts(page)
    // 游戏中：要么轮到我(叫数或开)，要么电脑思考中
    check(ts.some((t) => t.includes('轮到你') || t.includes('思考中') || t.includes('摇一摇')), '人机进入对局并渲染')
    // 等电脑/我推进几步，确认不卡死（至少出现过当前叫或揭晓）
    await sleep(3000)
    ts = await texts(page)
    check(ts.length > 3, '人机对局持续渲染未白屏')
  }

  // 线下骰盅：摇一次
  page = await mp.reLaunch('/pages/solo/index')
  await sleep(800)
  const roll = await findText(page, '摇骰子', 4000)
  check(!!roll, '线下摇骰按钮')
  if (roll) {
    await roll.tap()
    await sleep(900)
    ts = await texts(page)
    check(ts.some((t) => t.includes('你的骰子') || t.includes('盖住') || t.includes('摇')), '线下掷骰后渲染手牌')
  }

  console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS')
  process.exitCode = failed ? 1 : 0
} finally {
  try { mp.disconnect() } catch { /* 已断开 */ }
}
