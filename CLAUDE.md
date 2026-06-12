# dahua-dice-wxapp — Project Instructions

> 大话骰（Liar's Dice）的**微信小程序版**。web 版在 sibling repo `~/projects/side-projects/dahua-dice/`（Next.js + Vercel + Upstash，已上线 dahua-dice.vercel.app）。本 repo 当前状态：**规划完成，未开工** —— 设计/计划/前置条件都已写好，从 `docs/plans/2026-06-11-wxapp-plan.md` 的 WXAPP-0 开始。

## Identity

- **Path**: `~/projects/side-projects/dahua-dice-wxapp/`（与 web 版 pair 平级，见 `~/projects/CLAUDE.md` pair 约定）
- **定位**: friends-only 非商用，**体验版分发**（个人主体 15 体验成员 + 15 项目成员 ≈ 31 人）
- **AppID / 云开发 EnvId**: 未注册（WXAPP-0 步骤 1-2 产出后填到这里）

## Critical rules（违反任意一条 = 项目根基崩塌）

1. **永不提审/上架。** 零备案/审核/版号/认证的合规根基就是停留在体验版。个人主体被排除在牌类小游戏类目外，提审必被打回且暴露类目违规。谁（包括未来的 agent）想"顺手发布一下"，先读 `docs/research/wechat-miniprogram-friends-only-playbook.md`。
2. **游戏内零真钱/积分兑换/红包元素。** 赌博相关是腾讯对未上架内容唯一主动执法的类别。命名也不要往赌上靠。
3. **普通小程序 + 工具类目，不是小游戏账号。** 注册错了账号类型会触发游戏资质门槛，没有回头路（类目不可逆）。
4. **骰子必须云函数侧 roll**（crypto），客户端动画纯装饰 —— 同 web 版。
5. **Taro 4 钉死 React 18**（react-reconciler 0.29）。从 web 版搬组件先剥 React 19 特性。WXSS 不支持 oklch/color-mix/@layer（postcss-preset-env 构建期降级）、无 document/window、组件用 View/Text。
6. **实时同步必须双通道**：`db.watch` 主 + 3s 轮询兜底（watch 无 SLA、偶发掉监听）。UI 以 `version` 单调递增去重。断线 UI 由数据 staleness 驱动，不由 watch 连接状态驱动（web 版教训）。
7. **单写入口 + version-CAS**：所有 mutation 走 `room` 云函数；安全规则 deny client write；CAS 失败（`stats.updated===0`）重读重试 ≤4。**start 的 CAS 基于服务端自己读的 version，不是客户端送的**（web 版 TOCTOU 教训）。
8. **手牌私密**：未揭晓手牌只存 `hands` 集合（owner-only 安全规则），永不进 `rooms` 文档（客户端 watch 它 = 透视挂）。
9. **引擎不 fork**：`engine/` 与 web 版 `lib/game-engine/` 保持 diff=0，修 bug 双向同步并在两边 commit message 注明。
10. **EnvId 显式写在代码/配置里**，不依赖 CLI 当前选中环境（cloudbase skill 守则）。
11. **mp.weixin.qq.com 每 ≤3 个月登录一次**（闲置冻结，人肉日历提醒）。

## Tech stack quick ref

| 层 | 选型 |
|---|---|
| 框架 | Taro 4.x + **React 18** + TypeScript |
| 样式 | weapp-tailwindcss v4 + postcss-preset-env（主题 tokens 从 web 版移植，CSS 变量注入 page 根） |
| 后端 | 微信云开发：云函数（`room.create/get/act` + `cron.cleanup`）+ 云数据库（`rooms`/`hands`） |
| 实时 | `db.watch` + 3s poll 双通道 |
| 身份 | `wx.login` → 云函数 `getWXContext().OPENID`（无 session 层）；昵称头像用官方填写能力（getUserProfile 已废） |
| 分享 | `onShareAppMessage` path 带房间码 → onLoad 自动 join；永久体验版码 `getunlimitedqrcode`(trial) |
| 引擎 | 复制自 web 版 `lib/game-engine/`（types/validate/round + 单测），vitest |
| 音效 | 仅摇骰子单音效：`wx.createInnerAudioContext` 单实例（`assets/audio/dice-shake.mp3`，CC0，来源见 `assets/audio/README.md`）；BGM/其余 SFX 砍掉 |
| 测试 | vitest（引擎/云函数）+ miniprogram-automator 冒烟（本地，CI 不可用） |
| 工具 | 微信开发者工具（需开服务端口）；上传走 `miniprogram-ci` 密钥 |

## Commands

```bash
# WXAPP-1 脚手架后填入实际命令（taro build / vitest / automator 冒烟 / ci 上传）
# 当前 repo 只有 docs，无 build
```

## File layout（规划，WXAPP-1 落地）

```
engine/            # 复制自 web 版 lib/game-engine（共享给云函数与客户端）
cloudfunctions/
└─ room/           # 唯一写入口（create/get/act）+ cron.cleanup
src/
├─ pages/index/    # 首页：昵称头像 + 创建/加入
├─ pages/room/     # lobby + game（phase 驱动，对应 web 版 RoomClient）
├─ components/     # dice/ game/ theme/（从 web 版移植）
└─ hooks/          # useRoomSync（watch+poll 双通道）
assets/
└─ audio/          # 摇骰音效（dice-shake.mp3，CC0）+ README（来源/license）——已入库，WXAPP-4 接线
docs/
├─ specs/2026-06-11-wxapp-design.md     # 设计契约（数据模型/云函数/页面/风险）
├─ plans/2026-06-11-wxapp-plan.md       # WXAPP-0..7 实施计划（含 prerequisites）
└─ research/                            # 调研 + 合规 playbook 快照
```

## Reference docs

- `docs/specs/2026-06-11-wxapp-design.md` — 设计契约
- `docs/plans/2026-06-11-wxapp-plan.md` — 实施计划；**WXAPP-0 是人肉前置步骤清单（注册/开通/加成员），开工先看它**
- `docs/research/2026-06-11-wechat-miniprogram-port.md` — 调研决策记录（架构映射、公开上架不可行性、open questions）
- `docs/research/wechat-miniprogram-friends-only-playbook.md` — 合规 playbook 快照（canonical 维护版在 `~/.claude/references/wechat-miniprogram-friends-only.md`）
- web 版规则契约：`~/projects/side-projects/dahua-dice/docs/specs/2026-05-21-dahua-dice-design.md` §10/§10B（中式扩展/Palifico 语义 —— 本 repo 不重复）
- CloudBase skill：`.claude/skills/cloudbase`（vendor 在 `.agents/skills/cloudbase`，16 份参考文档，`Skill(cloudbase)` 调用）
- 跨项目记忆：`~/.claude/projects/-Users-xingfanxia-projects/memory/reference_wechat_miniprogram_friends_only.md`
