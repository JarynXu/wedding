import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AiGate } from '../server/ai/gate.js';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';

test('五个实例的AI名额合计不超预算，死亡实例租约可恢复',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture(),scope='gate-'+randomUUID();
  try{
    const gates=Array.from({length:5},()=>new AiGate(f.pool,{scope,limit:3}));let active=0,peak=0;
    const results=await Promise.allSettled(Array.from({length:30},async(_,index)=>{const gate=gates[index%5],lease=await gate.acquire(AbortSignal.timeout(15000));active++;peak=Math.max(peak,active);await delay(25);active--;await gate.release(lease);}));
    for(const result of results)assert.equal(result.status,'fulfilled',result.reason?.message);
    assert.ok(peak<=3);assert.equal(peak,3);
    const dead=await gates[0].acquire();await f.pool.query("UPDATE wedding_ai_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[dead]);
    const resumed=await gates[4].acquire(AbortSignal.timeout(2000));assert.notEqual(resumed,dead);await gates[4].release(resumed);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM wedding_ai_leases WHERE scope=$1',[scope])).rows[0].count,0);
  }finally{await f.pool.query('DELETE FROM wedding_ai_leases WHERE scope=$1',[scope]);await f.pool.query('DELETE FROM wedding_ai_controls WHERE scope=$1',[scope]);await f.close();}
});
