import { randomUUID } from 'node:crypto';
import { log, traceContext } from '../observability.js';
import { setTimeout as delay } from 'node:timers/promises';

/** 所有实例共用账号预算；只在领取/释放名额时使用数据库连接。 */
export class AiGate {
  constructor(pool,{scope='deepseek-main',limit=120}={}) { Object.assign(this,{pool,scope,limit}); }
  async acquire(signal) {
    const started=performance.now();
    while(true){
      signal?.throwIfAborted();const client=await this.pool.connect();let granted,wait=250;
      try{
        await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'");
        await client.query('SELECT pg_advisory_xact_lock(1279440461,hashtext($1))',['ai:'+this.scope]);
        await client.query("INSERT INTO wedding_ai_controls(scope) VALUES($1) ON CONFLICT DO NOTHING",[this.scope]);
        await client.query('DELETE FROM wedding_ai_leases WHERE scope=$1 AND expires_at<=clock_timestamp()',[this.scope]);
        const state=(await client.query('SELECT CASE WHEN blocked_until>clock_timestamp() THEN extract(epoch FROM(blocked_until-clock_timestamp()))*1000 ELSE 0 END AS blocked FROM wedding_ai_controls WHERE scope=$1',[this.scope])).rows[0];
        const count=Number((await client.query('SELECT count(*) AS count FROM wedding_ai_leases WHERE scope=$1',[this.scope])).rows[0].count);
        if(Number(state.blocked)>0)wait=Math.min(1000,Math.max(100,Number(state.blocked)));
        else if(count<this.limit){granted=randomUUID();await client.query("INSERT INTO wedding_ai_leases(id,scope,expires_at,trace_id) VALUES($1,$2,clock_timestamp()+interval '45 seconds',$3)",[granted,this.scope,traceContext().trace_id||null]);}
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      if(granted){if(performance.now()-started>100)log('ai.admission_wait',{wait_ms:Math.round(performance.now()-started),limit:this.limit});return granted;}
      await delay(wait+Math.floor(Math.random()*80),undefined,{signal});
    }
  }
  release(id) { return this.pool.query('DELETE FROM wedding_ai_leases WHERE id=$1 AND scope=$2',[id,this.scope]); }
  async cooldown(ms) { await this.pool.query("INSERT INTO wedding_ai_controls(scope,blocked_until) VALUES($1,clock_timestamp()+$2*interval '1 millisecond') ON CONFLICT(scope) DO UPDATE SET blocked_until=greatest(wedding_ai_controls.blocked_until,excluded.blocked_until)",[this.scope,ms]); }
}
