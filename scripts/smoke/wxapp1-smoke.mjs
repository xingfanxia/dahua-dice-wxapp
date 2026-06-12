// WXAPP-1 verify gate 冒烟：模拟器渲染测试页 + room 云函数 echo 回包。
// 前置：微信开发者工具已装并登录、服务端口已开、room 云函数已部署、`pnpm build` 产物最新。
// 运行：node scripts/smoke/wxapp1-smoke.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'

const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const miniProgram = await automator.launch({ cliPath: CLI, projectPath })
try {
  const page = await miniProgram.reLaunch('/pages/index/index')

  // 等 echo 回包（轮询而非裸 sleep）
  let echoText = ''
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const el = await page.$('.break-all')
    echoText = el ? await el.text() : ''
    if (echoText && echoText !== '未调用') break
  }

  const title = await (await page.$('.text-2xl'))?.text()
  const bidRows = await page.$$('.rounded-xl')

  console.log('title:', title)
  console.log('bidChain rows:', bidRows.length)
  console.log('echo:', echoText)

  const pass =
    title === '闹麻大话骰' &&
    bidRows.length >= 3 && // 3 条假出价 + echo 卡片
    echoText.includes('"ok":true') &&
    echoText.includes('openid')
  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL')
  process.exitCode = pass ? 0 : 1
} finally {
  await miniProgram.close()
}
