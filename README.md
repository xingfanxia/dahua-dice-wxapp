# dahua-dice-wxapp 大话骰小程序版

[大话骰 web 版](https://github.com/xingfanxia/dahua-dice)的微信小程序版本 —— friends-only、非商用、**体验版分发**（永不上架，因此零备案/零审核/零版号）。核心增量：微信社交闭环 —— 群里发卡片，朋友点开直接进房间。

**状态：agent 可做部分全部完成（2026-06-12）。** 后端（云函数全 action + 战绩 + cleanup/qrcode）、双通道实时同步、全部 UI（含 dark/light、出局观战、断线 staleness、join 三态）、规则编辑器、分享自动进房，65 测试全绿。剩余为一次性人肉步骤（miniprogram-ci 密钥 → 部署/上传全自动化、数据库安全规则、真机双人验证），见 [`docs/plans/2026-06-11-wxapp-plan.md`](docs/plans/2026-06-11-wxapp-plan.md)。

## 成员管理 SOP（体验版分发的运维面）

体验版只有「体验成员」能打开 —— 这是微信的分发边界，不是 bug：

1. **先加人，再拉群**：mp 后台 → 管理 → 成员管理 → 体验成员（≤15 人，项目成员 ≤15 也算玩家位）。对方微信需开「隐私 → 可通过微信号搜索到我」。
2. **非成员点分享卡片**：微信在小程序启动前就弹系统拦截页（"无权限"），我们的 UI 永远没机会渲染。处理方式 = 把人加进体验成员，没有代码解法。
3. **群公告挂永久码**：`qrcode` 云函数生成体验版小程序码（`{scene:'home'}`），图片放群公告，新人扫码即开（前提还是已加成员）。
4. **mp 后台每 ≤3 个月登录一次**，防闲置冻结（设个重复日历提醒）。

## 文档地图

| 文档 | 内容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 60 秒上手 + 11 条铁律（合规根基 + web 版移植教训） |
| [`docs/specs/2026-06-11-wxapp-design.md`](docs/specs/2026-06-11-wxapp-design.md) | 设计契约：架构/数据模型/云函数/页面/风险 |
| [`docs/plans/2026-06-11-wxapp-plan.md`](docs/plans/2026-06-11-wxapp-plan.md) | WXAPP-0..7 实施计划（每阶段带 verify gate） |
| [`docs/research/`](docs/research/) | 调研决策记录 + 合规 playbook 快照 |

技术栈：Taro 4 (React 18) + weapp-tailwindcss · 微信云开发（云函数 + 云数据库 `db.watch` 实时同步）· 规则引擎原样移植自 web 版（纯 TS + 单测）。
