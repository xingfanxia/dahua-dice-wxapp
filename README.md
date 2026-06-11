# dahua-dice-wxapp 大话骰小程序版

[大话骰 web 版](https://github.com/xingfanxia/dahua-dice)的微信小程序版本 —— friends-only、非商用、**体验版分发**（永不上架，因此零备案/零审核/零版号）。核心增量：微信社交闭环 —— 群里发卡片，朋友点开直接进房间。

**状态：规划完成，未开工。** 从 [`docs/plans/2026-06-11-wxapp-plan.md`](docs/plans/2026-06-11-wxapp-plan.md) 的 **WXAPP-0（人肉前置步骤）** 开始：

1. 注册个人主体小程序（工具类目，⚠ 不是小游戏账号）→ 拿 AppID
2. 开通云开发免费环境 → 拿 EnvId
3. mp 后台添加体验成员（≤15）
4. 装微信开发者工具 + Taro CLI

## 文档地图

| 文档 | 内容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 60 秒上手 + 11 条铁律（合规根基 + web 版移植教训） |
| [`docs/specs/2026-06-11-wxapp-design.md`](docs/specs/2026-06-11-wxapp-design.md) | 设计契约：架构/数据模型/云函数/页面/风险 |
| [`docs/plans/2026-06-11-wxapp-plan.md`](docs/plans/2026-06-11-wxapp-plan.md) | WXAPP-0..7 实施计划（每阶段带 verify gate） |
| [`docs/research/`](docs/research/) | 调研决策记录 + 合规 playbook 快照 |

技术栈：Taro 4 (React 18) + weapp-tailwindcss · 微信云开发（云函数 + 云数据库 `db.watch` 实时同步）· 规则引擎原样移植自 web 版（纯 TS + 单测）。
