import { createRequire } from 'node:module';
import { VisitStore } from '../server/visits/store.js';

const require = createRequire(import.meta.url);
let PGlite;
try { ({ PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')); } catch {}
export const visitsTestAvailable = Boolean(PGlite);

/** PGlite 运行真正的 PostgreSQL 查询；单连接按租约排队，事务之间不交错。 */
export async function visitFixture(room = 'visits-test') {
  const db = new PGlite(); await db.waitReady;
  let tail = Promise.resolve();
  async function lease() {
    const previous = tail; let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  }
  const query = async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) || { rows: [] };
  const pool = {
    async query(sql, params) { const release = await lease(); try { return await query(sql, params); } finally { release(); } },
    async connect() { const release = await lease(); return { query, release }; },
  };
  const config = { room, secret: 'isolated-visitor-test-secret-over-32-characters', origin: 'http://127.0.0.1' };
  const store = new VisitStore(pool, room);
  await store.ensure();
  return { pool, config, store, async close() { await tail; await db.close(); } };
}
