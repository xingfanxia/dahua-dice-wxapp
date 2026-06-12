/**
 * 云函数运行时入口（esbuild 打包为 ../index.js，wx-server-sdk external）。
 * 业务全在 dispatch（可注入 fake db 离线测试）；这里只做 cloud 初始化与身份提取。
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloud = require('wx-server-sdk');
import { wxRoomDb } from './db';
import { dispatch } from './main';

// EnvId 显式写死（铁律 10：不依赖 CLI/工具当前选中环境）
cloud.init({ env: 'cloud1-d5gfumwck6e89f9e6' });
const db = cloud.database();
const roomDb = wxRoomDb(db);

const COLLECTIONS = ['rooms', 'hands', 'stats'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.main = async (event: any) => {
  const { OPENID } = cloud.getWXContext();

  // 一次性建集合（部署后手动调一次 {op:'init'}；已存在则忽略）
  if (event?.op === 'init') {
    const created: string[] = [];
    for (const name of COLLECTIONS) {
      try {
        await db.createCollection(name);
        created.push(name);
      } catch {
        // already exists — fine
      }
    }
    return { ok: true, created };
  }

  return dispatch(roomDb, OPENID, event);
};
