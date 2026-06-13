/**
 * 入参校验 —— 移植自 web 版 lib/validation/schemas.ts。
 * 差异：去掉 session token（openid 即身份）、theme（wxapp 无主题）、
 * avatar id 集合改为 avatarUrl（微信头像填写能力给的是 URL/云文件路径）。
 */
import { z } from 'zod';

const codeField = z.string().min(1).max(12);

const NICK_MAX_LEN = 20;
const FORBIDDEN_RE = /[\x00-\x1F<>"'`&]/;

export type NickValidation = { ok: true; value: string } | { ok: false; reason: string };

export function validateNickname(input: unknown): NickValidation {
  if (typeof input !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > NICK_MAX_LEN) return { ok: false, reason: 'too_long' };
  if (FORBIDDEN_RE.test(trimmed)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value: trimmed };
}

/**
 * 头像约束（review M5）：只接受云存储 fileID（cloud://）或 https URL，拒绝 data:/http:/
 * 任意 scheme —— 这个字段客户端可控且会被所有房间成员的 <Image> 渲染。
 */
export function normalizeAvatarUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const s = input.trim();
  if (s.length === 0 || s.length > 512 || /[\x00-\x1F<>"'`\\]/.test(s)) return '';
  if (!s.startsWith('cloud://') && !s.startsWith('https://')) return '';
  return s;
}

export const gameRulesSchema = z.object({
  diceCount: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]),
  aceWild: z.boolean(),
  allowZhai: z.boolean(),
  startingBidFactor: z.number().min(1).max(3),
  diceSides: z.union([z.literal(6), z.literal(8)]),
  chineseExtensions: z.object({
    pi: z.boolean(),
    fanpi: z.boolean(),
    tongsha: z.boolean(),
  }),
  paliFicoVariant: z.boolean(),
  // #2 结算模式（与 web 引擎一致）。旧客户端不送 → 缺省补 attrition。
  endMode: z.enum(['attrition', 'party', 'knockout', 'score']).default('attrition'),
  knockoutLosses: z.number().int().min(1).max(20).default(3),
  scoreRounds: z.number().int().min(1).max(50).default(5),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    code: codeField,
    nick: z.string().max(40),
    avatarUrl: z.string().max(2048).optional(),
  }),
  z.object({ type: z.literal('start'), code: codeField }),
  z.object({ type: z.literal('rematch'), code: codeField }),
  z.object({
    type: z.literal('bid'),
    code: codeField,
    count: z.number().int().min(1).max(200),
    face: z.number().int().min(1).max(8),
    isZhai: z.boolean(),
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('challenge'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('pi'),
    code: codeField,
    targetPlayerId: z.string().min(1).max(64),
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('tongsha'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('nextRound'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({ type: z.literal('leave'), code: codeField }),
  z.object({ type: z.literal('setAvatar'), code: codeField, avatarUrl: z.string().max(2048) }),
  z.object({ type: z.literal('updateRules'), code: codeField, rules: gameRulesSchema }),
]);

export type ParsedAction = z.infer<typeof actionSchema>;
