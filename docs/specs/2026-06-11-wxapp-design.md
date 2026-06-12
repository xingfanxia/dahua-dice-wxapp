# 大话骰微信小程序版 · 设计契约（2026-06-11）

> 本文是 dahua-dice-wxapp 的设计源头。游戏规则本身不在此重复 —— 规则契约沿用 web 版 `dahua-dice/docs/specs/2026-05-21-dahua-dice-design.md` §10/§10B（中式扩展/Palifico 语义），引擎代码原样移植。本文只定义**小程序平台上的差异化设计**：分发模型、后端、数据模型、实时同步、页面与社交。

## 0. 产品定位与硬约束

- **是什么**：web 版大话骰的微信原生版本，核心增量 = 微信社交闭环（群/好友分享卡片直达房间，免输码免装 app）。
- **给谁**：固定朋友圈子，≤31 人（个人主体 15 体验成员 + 15 项目成员 + 管理员）。非商用。
- **分发模型（合规根基）**：**永远停留在体验版，永不提审上架**。零备案/审核/版号/认证的前提就是这一条 —— 任何"顺手点一下提审"都会触发全套游戏资质审查并必然被打回（个人主体牌类排除）。
- **铁律**：
  1. 游戏内零真钱/积分兑换/红包元素（体验版也零容忍的唯一类别）
  2. 不注册小游戏账号 —— 普通小程序 + 工具类目
  3. mp 后台每 ≤3 个月登录一次（防闲置冻结）
  4. 所有骰子在服务端（云函数）roll —— 与 web 版同理，客户端动画纯装饰

## 1. 技术栈

| 层 | 选型 | 钉死原因 |
|---|---|---|
| 框架 | **Taro 4.x + React 18** + TypeScript | Taro 是唯一现实的 React 复用路径；react-reconciler 0.29 钉死 React 18（React 19 是 open issue）—— 从 web 版搬组件时注意去掉 React 19 特性（use()、Actions 等） |
| 样式 | weapp-tailwindcss v4 + postcss-preset-env | WXSS 不支持 oklch/color-mix/@layer → 构建期降级；keyframes/transform/opacity/CSS 变量可用 |
| 后端 | 微信云开发（CloudBase）：云函数 + 云数据库 | `wx.cloud` 绕过合法域名白名单；未发布期间免费（活动至 2026-12-31）|
| 实时 | `db.watch`（主）+ 3s 轮询（兜底） | watch 无 SLA、偶发掉监听；双通道是硬要求，不是优化 |
| 引擎 | `dahua-dice/lib/game-engine/`（types/validate/round）+ 单测，**原样复制** | 纯 TS 纯函数，零平台依赖；测试一并移植（vitest 跑在云函数包内） |
| 测试 | vitest（引擎+云函数逻辑）+ miniprogram-automator（冒烟） | automator 驱动微信开发者工具，CI 不可用 → 冒烟脚本本地跑 |

## 2. 架构总览

```
小程序客户端 (Taro/React 18)
  ├─ wx.cloud.callFunction('room') ──→ 云函数 room（唯一写入口）
  │                                      ├─ 引擎 lib/game-engine (复制自 web 版)
  │                                      ├─ dice-rng (crypto)
  │                                      └─ db 事务: version-CAS 写 rooms/{code}
  ├─ db.collection('rooms').doc(code).watch() ←─ 实时推送（主通道）
  ├─ 3s poll: callFunction('room', {op:'get'})  ←─ 兜底通道
  └─ db.collection('hands').where(_openid==me).watch/get ←─ 私有手牌（安全规则隔离）
```

设计不变量（继承 web 版的教训）：

- **单写入口**：所有 mutation 走一个 `room` 云函数（discriminated union op，对应 web 版 `/api/action`）。客户端永不直写 rooms 集合（安全规则 deny client write）。
- **version-CAS**：room 文档带 `version`；云函数内 `where({_id, version}).update({...state, version: _.inc(1)})`，`stats.updated===0` → 409 重读重试（≤4×，对齐 web 版 startGame 教训：**start 的 CAS 基于服务端自己读到的 version，不是客户端送来的**）。
- **手牌私密**：`hands` 集合每文档 `{_openid(玩家), roomCode, round, dice[]}`，安全规则 owner-only read；room 文档**永不含未揭晓手牌**（客户端 watch 它，放进去=透视挂）。揭晓时云函数把全部手牌写进 `rooms.outcome.hands`（此时公开是规则的一部分）。
- **失败要响**：callFunction 失败 toast + 状态回滚；409 自动 resync（对齐 web 版 stale-409 处理）。

## 3. 数据模型

```ts
// collection: rooms — doc _id = 房间码 (复用 invite-code 生成器, 无 0/1/I/L/O)
interface RoomDoc {
  version: number          // CAS
  phase: 'lobby'|'bidding'|'reveal'|'game_end'
  round: number
  players: Player[]        // {playerId(=openid hash), nick, avatar, seat, diceCount, alive}
  hostId: string
  currentTurnIdx: number
  lastBid: Bid | null
  bidChain: Bid[]
  palificoActive/BidderId/Triggered  // 同 web 版 RoomState
  rules: GameRules         // DEFAULT_RULES 同源
  outcome: (ChallengeOutcome & { hands?: Record<string, number[]> }) | null
  createdAt/updatedAt: Date
}
// collection: hands — _openid 自动字段 = 拥有者; owner-only read 安全规则
interface HandDoc { roomCode: string; round: number; dice: number[] }

// collection: stats — _id = openid，玩家战绩（AX 2026-06-12 指示：统计挂微信身份）
// 仅 room 云函数在 game_end 解算时写入（单写入口不破例）；安全规则 owner-only read
interface StatsDoc {
  nick: string; avatarUrl: string        // 冗余最近一次微信资料，便于展示
  gamesPlayed: number; wins: number
  challengesWon: number; challengesLost: number   // 开/劈/通杀的胜负归并计数
  lastPlayedAt: Date
}
```

- TTL 替代（云数据库无 Redis TTL）：`updatedAt` + 云函数定时触发器（每日）清理 >24h 的 rooms/hands。
- 身份：`wx.login` → 云函数侧 `cloud.getWXContext().OPENID`，不存 session 集合 —— openid 即稳定匿名身份（比 web 版的 session token 更简单，砍掉整个 session 层）。昵称头像入 room.players，来自头像昵称填写能力组件。

## 4. 云函数清单（对照 web 版）

| 云函数 op | 对应 web 版 | 说明 |
|---|---|---|
| `room.create` | POST /api/room | 生成房间码，建 RoomDoc |
| `room.get` | GET /api/room/[code]/full | 轮询兜底 + 进房快照（剥离未揭晓 outcome.hands — 防御性，正常时本就没有） |
| `room.act` {action} | POST /api/action | join/start/bid/challenge/pi/tongsha/nextRound/leave/setAvatar/updateRules/rematch — Zod 校验复用 `lib/validation/schemas.ts`（去掉 token 字段），引擎 `round.ts` 解算，CAS 提交 |
| `room.hand` | GET /api/hand/[code] | 可选 —— 客户端可直接安全规则读 hands；保留函数形态以备规则不够用 |
| `room.stats` | （web 版无此功能） | 读自己的 StatsDoc（openid 即 key）；写入发生在 act 的 game_end 解算内，不单独开写口 |
| `cron.cleanup` | （Redis TTL） | 定时触发器清过期房间 |

不移植：`/api/stream`（SSE→watch）、`/api/session`+`/api/whoami`（openid 替代）、`/api/health`、rate-limit（云函数有平台配额；体验版 31 人无滥用面 —— 砍掉，记录在案）。

## 5. 页面与组件

```
pages/
├─ index/        # 首页: 昵称+头像(官方填写能力) · 创建/加入 · 我的房间回跳 · 我的战绩卡片
└─ room/         # 大厅+游戏 (phase 驱动, 对应 web 版 RoomClient)
components/      # 结构/逻辑从 web 版移植 (div→View/Text)，视觉按本 repo 设计原则重做
├─ dice/         # Dice2D 动画结构移植 (keyframes/transform 直接可用)
└─ game/         # BidPanel / PlayerRing / BidChain / RevealStage / AvatarBadge
```

### 5.1 UI 设计原则（AX 2026-06-12 指示，覆盖原"移植 web 主题"方案）

- **简洁大方、可读性优先**——不移植 web 版四主题/字体体系，不追求 web 版 aesthetic。中性底色 + 单一强调色，大字号、高对比。
- **dark / light 双模式**：weapp 原生 `darkmode: true` + `theme.json`（导航栏/背景跟随系统），页面内用 CSS 变量双套取值；设置处给一个手动覆盖开关（跟随系统/浅色/深色，存 storage）。tailwind 的 dark: variant 由根节点 class 驱动，与覆盖开关联动。
- 微信身份贯穿：进房用微信昵称头像（官方填写能力，资料预填），战绩按 openid 累计、以本人微信资料展示（见 §3 StatsDoc）。

- **入房即玩的分享流**：`onShareAppMessage` → `path: 'pages/room/index?code=XXXX'`，卡片 title "来玩大话骰 · 房间XXXX 等你"，imageUrl 5:4 主题图。接收方（体验成员）点卡片 → `onLoad` 拿 code → 自动 join。**这是本项目存在的理由，最高优先级打磨。**
- **首次进房 journey（卡片直达，绕过首页）**：room 页 onLoad 时本地无昵称 → 底部半屏 sheet（昵称填写 + 官方头像选择 + 单按钮"进入房间"），填完即 join —— 不弹回首页（断链会杀死分享流的全部价值）。昵称/头像存 storage，二次进房静默 join。
- **非体验成员点卡片**：微信在小程序启动前就拦截（"无权限"系统页），**我们的 UI 永远没机会渲染** —— 这不是 bug，是体验版分发模型的边界。对策全在运维侧：先加人再拉群（成员 SOP 写进 README），群公告挂永久体验版码方便新人申请体验。
- **join 失败三态**（room 页全屏态，非 toast——用户是点卡片来的，没有"原页面"可退）：① 房间不存在/已过期（cleanup 后）→ "房间已散场" + 主按钮"创建新房间"；② 房间已满 → "房间满员（6/6）" + "创建新房间"；③ 游戏已开始且非本局成员 → "本局已开打" + 房间内实时战况只读预览（lobby 数据本就在 room doc）+ "等下一局"提示（rematch 时自动可加入）。三态都保留房间码展示，方便口头对码。
- **动态消息**（v1.1 可选）：分享卡片实时显示"X/Y 人已加入"。
- 群识别（shareTicket + getGroupEnterInfo）：v1 不做，记录能力备用（同群战绩等）。
- **出局观战态**（web 版血泪教训直接继承）：alive=false 的玩家停止读 hands（出局者无手牌，别让客户端空轮询）、中心区换 💀"你已出局 · 观战中"横幅、保留全部实时战况；game_end 时与活人同屏看结算 + rematch 自动满血回归。
- 摇骰子：`wx.onDeviceMotionChange`（无权限弹窗）+ `wx.vibrateShort` + **摇骰音效**——`wx.createInnerAudioContext` 单实例复用（每次摇 `seek(0)` 重播，不重建实例），资产 `assets/audio/dice-shake.mp3`（CC0，来源/license 见 `assets/audio/README.md`）。`obeyMuteSwitch` 保持默认 true（跟随系统静音键，不做独立音效开关——全游戏只有这一个音效，开关不值得一个设置项）。

### 5.5 交互状态表（每格 = 用户所见，非后端行为）

| 界面/功能 | LOADING | EMPTY | ERROR | SUCCESS | 备注 |
|---|---|---|---|---|---|
| 首页 | skeleton 房间码输入框 | 昵称未填 → 按钮置灰 + placeholder 引导 | create 云函数失败 → toast + 按钮恢复 | 跳 room 页 | |
| room 进房 | 全屏主题色 spinner + "正在进入房间 XXXX" | — | join 三态全屏页（见上） | 落座大厅 | 卡片直达首次 → 先昵称 sheet |
| 大厅 | — | 只有自己 → "把房间分享到群里"主按钮（分享即空态的 primary action） | start 失败 toast + 自动 resync | 全员列表 + 房主见"开始"、非房主见"等待房主开始…"（web 版教训） | |
| 叫骰 | 提交中按钮 spinner + 防双击 | — | 409 → 静默 resync 后 toast "桌面有变，请再看一眼" | 出价入 bidChain，回合推进 | `key={round}` 防跨轮残留（web 版教训） |
| 开/劈/通杀 | 确认弹层（防误触，继承 web 版） | — | 同 409 处理 | RevealStage 全员手牌揭晓 | |
| 出局 | — | — | — | 💀 观战横幅（见上） | |
| 断线 | — | — | staleness >10s → 顶部横幅"同步中断，重连中…"；>30s → 全屏遮罩 + "重新进入"按钮 | 横幅自动消失 | 由数据新鲜度驱动，非 watch 连接状态（铁律 6） |
| game_end | — | — | rematch 失败 toast | 结算榜 + "再来一局"/"离开房间" | 离开≠解散（web 版文案教训） |
- 移动端硬规格：safe-area 适配（`env(safe-area-inset-*)`，刘海/底部条机型）；触控目标 ≥44px、确认弹层防误触、`prefers-reduced-motion` 静态骰子 —— 全部继承 web 版 a11y 已有决策，不降级。
- 音频：**仅保留摇骰子单音效**（见 §5.4 摇骰子条）；BGM 和其余 SFX 砍掉（web 版本来默认关）。i18n：zh-CN 硬编码，文案直接抄 `messages/zh-CN.json`。
- solo 模式：v2 再说（web 版 /solo 已覆盖该场景）。

## 6. 体验版运维（产品的一部分）

- 成员管理 SOP：mp 后台加体验成员（对方需开"可通过微信号搜索"）；项目成员位也算玩家位。
- 永久入口：`getunlimitedqrcode`（`env_version:"trial"`, `check_path:false`）生成常驻群公告的小程序码。
- 上传节奏：微信开发者工具/CLI 上传 → 设为体验版；无 CI 部署（开发者工具签名限制），用 `miniprogram-ci` 密钥可脚本化（白名单 IP）。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| watch 掉监听/延迟尖刺 | 双通道（watch+3s poll）从 day 1 就有；UI 以 version 单调递增去重 |
| 免费环境并发 watch 连接限额不明（资源点个人版查到 10 条） | 开工先做连接压测（6 客户端×2 watch）；不够则 poll-only 降级开关 |
| Taro/React 18 移植踩坑（web 版组件用了 React 19 特性） | WXAPP-1 先移植最薄的组件验证链路，再批量搬 |
| 体验版成员位用尽 | 文档化第二 appid 方案（个人可注册 5 个） |
| 账号闲置冻结 | CLAUDE.md 铁律 + 日历提醒（人肉） |
