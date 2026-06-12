import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 铁律 9：engine/ 与 web 版 lib/game-engine/ 保持 diff=0，测试文件也 byte-identical。
// 这里把 web 版的 '@/lib/game-engine' 别名指到本 repo 的 engine/，
// 让测试文件无需改 import 即可原样运行 —— 双向同步 = 纯文件拷贝。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/lib/game-engine': path.resolve(__dirname, 'engine'),
    },
  },
});
