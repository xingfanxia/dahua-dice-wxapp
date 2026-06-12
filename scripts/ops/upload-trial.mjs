// 体验版上传（WXAPP-7）：miniprogram-ci，密钥就绪后即全自动。
// 前置（一次性人肉）：mp 后台 → 开发设置 → 生成「小程序代码上传密钥」，存
//   ~/.secrets/wechat-miniprogram-ci/naoma-dahua-dice/private.wx20a31f84ad3fc6fb.key（勿入 repo）；IP 白名单建议关闭。
// 用法：pnpm build && node scripts/ops/upload-trial.mjs [版本号] [描述]
//   上传成功后到 mp 后台 → 版本管理 → 把该版本设为「体验版」（首次需手动设一次，之后沿用）。
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ci from 'miniprogram-ci'

const APPID = 'wx20a31f84ad3fc6fb'
const KEY = path.join(os.homedir(), '.secrets/wechat-miniprogram-ci/naoma-dahua-dice', `private.${APPID}.key`)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

if (!existsSync(KEY)) {
  console.error(`上传密钥不存在: ${KEY}\n去 mp 后台生成（见本文件头部注释）`)
  process.exit(1)
}

const version = process.argv[2] ?? '0.1.0'
const desc = process.argv[3] ?? `trial upload ${version}`

const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: ROOT, // 读 project.config.json（miniprogramRoot=dist, cloudfunctionRoot）
  privateKeyPath: KEY,
  ignores: ['node_modules/**/*'],
})

const result = await ci.upload({
  project,
  version,
  desc,
  setting: { es6: false, minify: true },
  onProgressUpdate: () => {},
})
console.log('upload OK', JSON.stringify(result.subPackageInfo ?? result, null, 2))
