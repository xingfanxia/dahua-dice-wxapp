import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 铁律 9：engine/ 与 web 版 lib/game-engine/ 保持 diff=0，测试文件也 byte-identical。
// '@/lib/game-engine' 别名指到本 repo 的 engine/（specific，必须排在 '@' 之前），
// 让 web 版引擎测试原样运行；其余 '@/...' 走 src/。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: /^@\/lib\/game-engine/, replacement: path.resolve(__dirname, 'engine') },
      { find: /^@\//, replacement: `${path.resolve(__dirname, 'src')}/` },
    ],
  },
});
