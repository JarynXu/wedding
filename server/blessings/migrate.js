import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { readBlessingsConfig } from './config.js';

const config = readBlessingsConfig();
if (!config) throw new Error('请先配置祝福数据库环境变量');
const client = new pg.Client(config.database);
try {
  await client.connect();
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('祝福表和索引已就绪');
} finally { await client.end(); }
