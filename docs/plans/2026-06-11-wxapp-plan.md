# 大话骰小程序版 · 实施计划（2026-06-11）

> 配套设计：`docs/specs/2026-06-11-wxapp-design.md`。里程碑命名 `WXAPP-N`。每阶段带 verify gate —— gate 不绿不进下一阶段。规则引擎不重写，从 web 版原样移植（`~/projects/side-projects/dahua-dice/lib/game-engine/`）。

## WXAPP-0: Prerequisites（人肉步骤，开工前一次性完成）

> **状态：✅ 完成（2026-06-12）** — 账号「闹麻大话骰」注册（工具-备忘录类目）、AppID + EnvId 见 CLAUDE.md Identity、头像/介绍已设、开发者工具已装已登录。延后项：体验成员（WXAPP-6 前加人即可）、miniprogram-ci 密钥（WXAPP-7 再生成）。备案/认证按铁律永不做。

**AX 本人做（需要身份/扫码，agent 做不了）：**

1. **注册个人主体小程序**：mp.weixin.qq.com → 注册 → 小程序 → 个人主体。需：未注册过 mp 的邮箱、大陆身份证号、本人实名微信扫码。类目选**工具**（如"效率/办公-日历/提醒"或"生活服务"下的中性子类，避开任何游戏字样）。⚠ 不要注册"小游戏"账号类型。产出：**AppID**（记到本 repo `.env` 注释 / CLAUDE.md）。
2. **开通云开发**：微信开发者工具 → 云开发 → 开通（选免费环境；未发布期间免费，活动至 2026-12-31）。产出：**环境 ID（EnvId）**。
3. **加体验成员**：mp 后台 → 成员管理 → 体验成员（≤15）+ 项目成员（≤15）。朋友需开启"可通过微信号搜索到我"。
4. （可选，脚本化上传用）mp 后台 → 开发管理 → 开发设置 → 生成 **miniprogram-ci 上传密钥** + 配置 IP 白名单。

**环境/工具链（agent 可做）：**

5. 安装**微信开发者工具**（macOS，stable channel）并登录（AX 扫码一次）；开启「服务端口」（Settings → Security → CLI/HTTP 调用）供 Taro/automator 使用
6. `pnpm add -g @tarojs/cli` —— Taro 4.x（开工时 `npm view @tarojs/cli version` 核实最新 4.x）
7. 验证 cloudbase skill 可用（`.claude/skills/cloudbase`，已 vendor 进本 repo）

**进入 WXAPP-1 的条件**：AppID + EnvId 到手，开发者工具能打开空项目并预览。

## WXAPP-1: 脚手架 + 引擎移植

> **状态：✅ 完成（2026-06-12）** — Taro 4.2.0 (React 18+Webpack5)；engine/ 与 web diff=0、42 单测绿；weapp-tailwindcss v5 链路验证（rpx/WXSS 安全）；BidChain 最薄移植；room 云函数 echo 已部署（首次需 IDE 右键部署引导建 namespace，之后 CLI 可用）；`pnpm smoke` automator 冒烟 PASS（渲染+echo+openid）。

- `taro init`（React + TS 模板）；接 weapp-tailwindcss v4 + postcss-preset-env（oklch 降级）
- 复制 web 版 `lib/game-engine/`（types/validate/round + 全部单测）到 `engine/`（独立 package，云函数与小程序端共享 import）；vitest 配置
- 云开发初始化：`cloudfunctions/room/` 空函数 + `wx.cloud.init({env})`；EnvId 显式写死在代码（cloudbase skill 守则）
- 最薄组件链路验证：把 web 版一个纯展示组件（如 BidChain）移植为 Taro 组件渲染假数据 —— 验证 React 18 + tailwind 链路
- **Verify**: `pnpm test` 引擎单测全绿（≥web 版同等数量）；开发者工具预览渲染出测试页；`room` 云函数 callFunction 回 echo

## WXAPP-2: 后端核心（云函数 + 数据模型）

> **状态：代码+测试 ✅（2026-06-12）；云端部署积压（见下）** — `cloud-src/room/`（create/get/hand/act 全 11 action/stats）+ `cloudfunctions/cleanup`；fake-db 注入 15 个云函数测试（含并发 bid CAS 冲突、战绩累计、终局全序列），57/57 绿。
>
> ⚠ **部署发现（2026-06-12）**：微信侧创建的环境，开发者工具 CLI `cloud functions deploy`/`inc-deploy` 一律报 `ResourceNotFound.Namespace`（IDE 图形右键部署正常 —— 两者走不同内部 API）。tcb CLI 也管不了微信侧环境的云函数。**自动化部署唯一可行路 = miniprogram-ci 密钥**（本来就是 WXAPP-7 的前置）。
>
> **积压的人肉步骤（一次做完，全自动化从此解锁）**：
> 1. mp 后台 → 开发管理 → 开发设置 → 生成「小程序代码上传密钥」，密钥文件存 `~/.secrets/wechat-miniprogram-ci/naoma-dahua-dice/private.wx20a31f84ad3fc6fb.key`（勿入 repo）；IP 白名单建议关闭（家用 IP 会变）
> 2. IDE 里右键 `cloudfunctions/room` →「上传并部署:云端安装依赖」（更新到 WXAPP-2 新代码）；同样右键部署 `cloudfunctions/cleanup`（新函数 + 定时触发器要在 IDE 上传触发器）
> 3. 部署后在 IDE 云开发控制台数据库建集合 `rooms`/`hands`/`stats`（或模拟器里调一次 `{op:'init'}`），并给三个集合贴安全规则（JSON 见设计 §3 末尾）

- `rooms`/`hands`/`stats` 集合 + 安全规则（client 对 rooms 只读、hands/stats owner-only read、全部 deny client write）
- `stats` 战绩写入：act 的 game_end 解算内按 openid 累计（gamesPlayed/wins/challenges），微信资料冗余进 doc（设计 §3 StatsDoc，AX 2026-06-12 指示）
- `room.create` / `room.get` / `room.act`（join/start/bid 三个 action 先行）：Zod 校验移植、openid 身份、dice-rng、version-CAS（**start 基于服务端读的 version + stale 自动重试 ≤4 — web 版教训**）
- `cron.cleanup` 定时触发器（清 >24h 房间）
- **Verify**: 云函数本地测试（`tcb fn` 或 vitest 注入 fake db）跑通 create→join×2→start→bid 序列；并发 bid 模拟 CAS 冲突只允许一个提交

## WXAPP-3: 实时同步双通道

> **状态：hook 层 ✅（2026-06-12）** — useRoomSync（注入式核心 + Taro.cloud 薄包装），8 个行为测试绿。连接压测（6 客户端 watch 限额）积压在云端部署之后。


- `useRoomSync` hook：`db.watch`（onChange 全量快照）+ 3s poll 兜底 + version 单调去重 + 掉线重建 watch（指数退避）
- **连接压测（风险卡点）**：6 个客户端（automator 多开/真机+工具）各 watch rooms+hands，确认免费环境连接限额无碍；不行则启用 poll-only 降级开关
- **Verify**: 双端开发者工具模拟 2 人，A bid → B 界面 <2s 更新；人为断 watch（关 wifi 重连）→ poll 接管无白屏

## WXAPP-4: 游戏 UI 主链路

> **状态：代码 ✅（2026-06-12）** — 首页+房间页全 phase、§5.5 状态表全量（昵称 sheet/三态/观战/staleness）、音效+震动、dark/light。UI 冒烟脚本 `scripts/smoke/wxapp4-smoke.mjs` 就绪（待云函数部署后跑）。⚠ automator 单实例同 openid 无法双人 —— "真的把一整局玩完"的整局逻辑由 tests/cloud 确定手牌全序列覆盖，双人实操归真机两账号步骤。


- pages/index：昵称+头像（官方填写能力）、创建/加入房间
- pages/room：lobby（成员列表/规则抽屉/开始）+ bidding（PlayerRing/BidPanel/BidChain）+ reveal（RevealStage + 手牌揭晓）+ game_end（rematch/离开）
- **设计 §5.5 交互状态表全量实现**：卡片直达首次进房昵称 sheet、join 失败三态全屏页（过期/满员/已开打）、出局观战横幅、断线 staleness 横幅
- UI 按设计 §5.1 原则实现：简洁大方可读性优先（**不移植 web 主题**，AX 2026-06-12 指示）；dark/light 双模式（`darkmode: true` + theme.json + 手动覆盖开关）；摇骰子 + 震动 + **摇骰音效**（`wx.createInnerAudioContext` 单实例，资产 `assets/audio/dice-shake.mp3` 已入库，license 见 `assets/audio/README.md`；automator 验不了音频 → 真机人耳验证归 WXAPP-7）
- **Verify**: 2 人全程：创建→分享码加入→start→若干轮 bid→开→淘汰（淘汰者见观战横幅）→game_end→rematch 二局 —— automator 冒烟脚本跑通（对齐 web 版 audit harness 思路：**真的把一整局玩完**，game-end softlock 教训）；外加 join 三态各触发一次（假码/满房/中途进）

## WXAPP-5: 完整规则

> **状态：代码 ✅（2026-06-12）** — RulesEditor（骰数/面数/万能1/斋/劈·反劈·通杀/Palifico）lobby 接线；规则语义引擎单测 42 + 云函数 fake-db 测试覆盖。局内劈/通杀/Palifico 实操验证归真机步骤。


- 劈/反劈/通杀/Palifico/8 面骰/转斋/叫1必斋/total-dice cap —— 引擎已带，工作量在 UI 接线 + i18n 文案（抄 zh-CN.json）
- **opening-bid floor clamp 到 totalDice（web 版 1v1 softlock 教训）单测必须随引擎一起在**
- **Verify**: 引擎单测全绿 + automator 跑 劈/通杀/Palifico 各一局（对齐 web 版 pi.spec/palifico.spec 覆盖面）

## WXAPP-6: 社交闭环（本项目的存在理由）

> **状态：代码 ✅（2026-06-12）** — onShareAppMessage 卡片（path 带码）+ onLoad 自动 join + 昵称 sheet 直达链路；`cloudfunctions/qrcode`（getUnlimited trial 码，待部署）；首页战绩卡片。动态消息按时间盒砍掉。真机卡片实测/非成员拦截 SOP 归真机步骤。


- `onShareAppMessage`：title "来玩大话骰 · 房间XXXX 等你" + 5:4 主题卡图 + path 带 code；onLoad 自动 join
- `getunlimitedqrcode`（trial）永久小程序码生成脚本（群公告用）
- 首页「我的战绩」卡片：`room.stats` 读自己的 StatsDoc，以微信昵称头像展示（设计 §3/§5.1）
- 动态消息（"X/Y 人已加入"）—— 可选，时间盒 1 天，不顺就砍
- **Verify**: 真机×2（体验成员）：A 群里发卡片 → B 点卡片直接落进房间并自动入座；另用一个**非成员**微信号点卡片，确认微信系统拦截页符合预期并把该行为写进 README 成员 SOP（"这不是 bug"）

## WXAPP-7: 打磨 + 体验版发布

> **状态：脚本就绪（2026-06-12）** — `scripts/ops/upload-trial.mjs` + `scripts/ops/deploy-fn-ci.mjs`（miniprogram-ci，等密钥即全自动）。真机双端整局 + 体验码发朋友 = 人肉验证。


- Dice2D 动画移植/简化、加载/错误态、断线横幅（staleness 驱动，非 watch 状态 —— web 版教训）
- `miniprogram-ci` 上传脚本 → 设为体验版；README 写成员管理 SOP
- **Verify**: 真机 iPhone + Android 各完整玩一局（含：摇骰音效双端可闻、iOS 静音键拨上后无声 —— `obeyMuteSwitch` 预期行为）；体验版二维码发给 ≥2 个朋友实测进房

## 明确砍掉（记录在案，避免未来 agent 误捡）

- 音频系统（BGM/全套 SFX；web 版默认关）——**例外：摇骰子单音效保留**（资产 `assets/audio/`，WXAPP-4 接线）、英文 i18n、rate-limit（体验版 31 人无滥用面）、session 集合（openid 即身份）、群识别 getGroupEnterInfo（备用）
- ~~solo 模式~~ **已恢复（2026-06-12，AX"功能都 match"指示）**：`pages/solo` 线下骰盅（本地 roll + 摇一摇 + 盖牌），零云依赖

## 跨阶段纪律

- 每阶段完成：更新本文件状态行 + commit；TodoWrite 同步
- 引擎文件与 web 版的 diff 保持为零（修 bug 双向同步，并在两边 commit message 注明）
- 任何"要不要提审上架"的念头 → 读 `docs/research/wechat-miniprogram-friends-only-playbook.md` 的公开上架风险段后打消
