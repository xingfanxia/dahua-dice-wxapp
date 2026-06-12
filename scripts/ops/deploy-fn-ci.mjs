// 云函数自动化部署（miniprogram-ci 路线 —— 开发者工具 CLI 对微信侧环境不可用，见 CLAUDE.md）。
// 前置同 upload-trial.mjs（同一把上传密钥）。
// 用法：pnpm build:fn && node scripts/ops/deploy-fn-ci.mjs [room cleanup qrcode]
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ci from 'miniprogram-ci'

const APPID = 'wx20a31f84ad3fc6fb'
const ENV = 'cloud1-d5gfumwck6e89f9e6'
const KEY = path.join(os.homedir(), '.secrets/wxapp-ci-key', `private.${APPID}.key`)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

if (!existsSync(KEY)) {
  console.error(`上传密钥不存在: ${KEY}`)
  process.exit(1)
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : ['room', 'cleanup', 'qrcode']
const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: ROOT,
  privateKeyPath: KEY,
  ignores: ['node_modules/**/*'],
})

for (const name of names) {
  const result = await ci.cloud.uploadFunction({
    project,
    env: ENV,
    name,
    path: path.join(ROOT, 'cloudfunctions', name),
    remoteNpmInstall: true,
  })
  console.log(`deploy ${name}:`, JSON.stringify(result))
}
