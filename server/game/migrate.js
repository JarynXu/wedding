import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { readBlessingsConfig } from '../blessings/config.js';
import { upgradePrizePolicy } from './prize-policy-upgrade.js';
const config = readBlessingsConfig();
if (!config) throw new Error('请配置请柬数据库环境变量');
const pool = new pg.Pool(config.database);
try { await pool.query(await readFile(new URL('../operations-schema.sql',import.meta.url),'utf8')); await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); const result=await upgradePrizePolicy(pool,config.room); console.log('游戏表和索引已就绪',result.changed?`奖项规则已升级至配置版本 ${result.version}`:''); }
finally { await pool.end(); }
