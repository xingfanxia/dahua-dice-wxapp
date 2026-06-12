/** 骰子与房间码生成 —— 移植自 web 版 lib/room/{dice-rng,invite-code}.ts（crypto 级随机，铁律 4）。 */
import { randomInt } from 'node:crypto';

export function rollDice(count: number, sides: number = 6): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(randomInt(1, sides + 1));
  return out;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, excludes 0/1/I/L/O
const CODE_LEN = 6;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export const INVITE_CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code);
}
