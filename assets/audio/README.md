# 音效资产 — 来源与 License

全部 **CC0 1.0（公共领域贡献）**：免署名、可修改、可随公开 repo 再分发。每个文件的 license 都在来源页逐一核验过（2026-06-11），Kenney 文件另与官方 zip 做过 SHA-256 比对确认出处。

## 已接线（WXAPP-4 打包进小程序）

| 文件 | 内容 | 时长 | 大小 | 来源 |
|---|---|---|---|---|
| `dice-shake.mp3` | 骰子落桌/扣盅声（AX 2026-06-12 钦定；内容 = Kenney `dice-throw-1`，128kbps 转码自官方 ogg） | 0.68s | 11KB | [Kenney · Casino Audio pack](https://kenney.nl/assets/casino-audio)，CC0 |

> 同一采样也接进了 web 版（`dahua-dice/public/audio/dice-throw.{mp3,webm}` → `useDiceAudio.settle()`），两边音感保持一致。

## 备选（`alternates/`，不进小程序包）

| 文件 | 内容 | 时长 | 来源 |
|---|---|---|---|
| `kenney-dice-shake-1/2/3.mp3` | 骰盅摇晃 3 个变体（游戏化音色，64kbps 转码自官方 ogg） | 1.4–1.6s | [Kenney · Casino Audio pack](https://kenney.nl/assets/casino-audio)，CC0 |
| `freesound-dice-shake-mackxd.mp3` | 真实塑料骰盅摇骰录音（48kHz mono） | 1.13s | [Freesound · "dice_shake" by mackxd (#529816)](https://freesound.org/people/mackxd/sounds/529816/)，CC0 |

## 规则

- **只有 `dice-shake.mp3` 进构建产物**（小程序主包 2MB 限额；Taro 构建时仅复制被引用的资产，alternates/ 留在 repo 不引用即可）。
- 换音效 = 把心仪的备选改名覆盖 `dice-shake.mp3`，本 README 表格同步更新。
- 新增音频必须 CC0（Pixabay/Mixkit 等"免费"库禁止 standalone 文件再分发，**不能进公开 repo** —— 2026-06-11 调研结论）。
