// WXAPP-4/5 UI 冒烟（单客户端可达路径）：首页渲染 → 设资料 → 创建房间 → lobby →
// 规则编辑器开/存 → 离开 → 假码 join 三态（no_room 全屏页）。
// 前置：room 云函数已部署 WXAPP-2+ 版本（op:create/act）、集合已建、`pnpm build` 最新。
// 双人整局属真机两账号步骤（automator 单实例同 openid 无法二人；整局逻辑由 tests/cloud 全覆盖）。
// 运行：node scripts/smoke/wxapp4-smoke.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'

const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const fail = (msg) => {
  console.error('SMOKE FAIL:', msg)
  process.exitCode = 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, timeoutMs = 8000, step = 300) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() > deadline) return null
    await sleep(step)
  }
}

const miniProgram = await automator.launch({ cliPath: CLI, projectPath })
try {
  // 资料直接写 storage（绕过 nickname 输入的人肉一致性，UI 输入路径真机另验）
  await miniProgram.callWxMethod('setStorageSync', 'profile', { nick: '冒烟员', avatarUrl: '' })

  let page = await miniProgram.reLaunch('/pages/index/index')
  await sleep(800)
  const title = await (await page.$('.text-3xl'))?.text()
  if (title !== '闹麻大话骰') fail(`home title: ${title}`)

  // 创建房间 → room 页 lobby
  const createBtn = await waitFor(async () => {
    const els = await page.$$('view')
    for (const el of els) {
      if ((await el.text().catch(() => '')) === '创建房间') return el
    }
    return null
  })
  if (!createBtn) {
    fail('create button not found')
  } else {
    await createBtn.tap()
    page = await waitFor(async () => {
      const p = await miniProgram.currentPage()
      return p?.path === 'pages/room/index' ? p : null
    }, 10000)
    if (!page) fail('did not navigate to room page')
  }

  if (page && page.path === 'pages/room/index') {
    await sleep(1500)
    const texts = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
    const all = texts.join('|')
    if (!/房间 [A-Z2-9]{6}/.test(all)) fail(`room header missing: ${all.slice(0, 200)}`)
    if (!all.includes('开始游戏') && !all.includes('至少 2 人')) fail('lobby start state missing')

    // 规则编辑器
    const modify = (await page.$$('text')).find
      ? await waitFor(async () => {
          for (const t of await page.$$('text')) {
            if ((await t.text().catch(() => '')) === '修改规则') return t
          }
          return null
        }, 4000)
      : null
    if (modify) {
      await modify.tap()
      await sleep(500)
      const texts2 = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
      if (!texts2.includes('规则设定')) fail('rules editor did not open')
      const save = await waitFor(async () => {
        for (const t of await page.$$('text')) {
          if ((await t.text().catch(() => '')) === '保存规则') return t
        }
        return null
      }, 3000)
      if (save) await save.tap()
      await sleep(800)
    } else {
      fail('修改规则 entry not found')
    }

    // 离开
    const leave = await waitFor(async () => {
      for (const t of await page.$$('text')) {
        if ((await t.text().catch(() => '')) === '离开房间') return t
      }
      return null
    }, 3000)
    if (leave) await leave.tap()
    await sleep(1200)
  }

  // 假码三态：no_room 全屏页
  page = await miniProgram.reLaunch('/pages/room/index?code=ZZZZZZ')
  await sleep(2500)
  const texts3 = await Promise.all((await page.$$('text')).map((t) => t.text().catch(() => '')))
  if (!texts3.some((t) => t.includes('房间已散场') || t.includes('房间不存在'))) {
    fail(`no_room fullpage missing: ${texts3.join('|').slice(0, 200)}`)
  }

  console.log(process.exitCode === 1 ? 'SMOKE DONE (with failures)' : 'SMOKE PASS')
} finally {
  await miniProgram.close()
}
