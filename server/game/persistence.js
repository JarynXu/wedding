import { log, logError } from '../observability.js';
/** 活动状态、答案与奖位的修改共用短事务锁；外部短信/AI 调用不得持有此事务。 */
export async function gameTransaction(pool, room, operation) {
  const started=performance.now();const client = await pool.connect(); let releaseError;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(1279440461,hashtext($1))', ['game:' + room]);
    const result = await operation(client); await client.query('COMMIT'); return result;
  } catch (error) { try { await client.query('ROLLBACK'); } catch (failure) { releaseError = failure; } if(!error.status)logError('db.transaction_failed',error,{room});throw error; }
  finally { client.release(releaseError);if(performance.now()-started>250)log('db.transaction_slow',{room,duration_ms:Math.round(performance.now()-started)},'warn'); }
}
