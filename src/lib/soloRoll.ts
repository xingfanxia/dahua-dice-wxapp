/**
 * 单机/线下骰盅的本地 roll —— 移植自 web 版 lib/solo/roll.ts。
 * 多人局必须服务端 roll（铁律 4 —— 客户端可作弊自己的手牌）；solo 无协议对手，
 * 手机只是一只公平骰盅：本地 roll 即可。weapp 运行时无 globalThis.crypto →
 * 走 Math.random 分支（solo 场景可接受；H5 构建仍吃 crypto 路径）。
 */
export function rollDiceClient(count: number, sides: number): number[] {
  const n = Math.max(0, Math.floor(count));
  const s = Math.max(2, Math.floor(sides));
  const out: number[] = [];
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObj?.getRandomValues) {
    const limit = Math.floor(256 / s) * s;
    const buf = new Uint8Array(1);
    for (let i = 0; i < n; i++) {
      let v: number;
      do {
        cryptoObj.getRandomValues(buf);
        v = buf[0];
      } while (v >= limit);
      out.push((v % s) + 1);
    }
    return out;
  }

  for (let i = 0; i < n; i++) {
    out.push(1 + Math.floor(Math.random() * s));
  }
  return out;
}
