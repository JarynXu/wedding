import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RoomOperations } from '../server/room-operations.js';
import { AdminAuth } from '../server/admin/auth.js';
import { AdminSecurityStore } from '../server/admin/security-store.js';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';
import { gameFixture,gameTestDatabase,adminLogin,gameRequest } from './game-fixture.mjs';
import { fixture as blessingsFixture,payload } from './blessings-fixture.mjs';
import { validateBlessing } from '../server/blessings/model.js';

test('五个后台实例共享登录限流和退出撤销',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture();
  try{
    const config=readAdminConfig({ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD_HASH:await hashPassword('correct-password'),ADMIN_SESSION_SECRET:f.runtime.sessionSecret});
    const auths=Array.from({length:5},()=>new AdminAuth(config,{store:new AdminSecurityStore(f.pool,config)}));
    const results=await Promise.all(Array.from({length:10},(_,i)=>auths[i%5].login('test-admin','wrong-password','shared-network')));
    assert.equal(results.filter(result=>result.rateLimited).length,5);
    const login=await auths[0].login('test-admin','correct-password','owner-network');assert.equal(login.ok,true);
    const cookie='admin_session='+login.cookieValue;assert.ok(await auths[4].authenticateCookie(cookie));
    await auths[2].logout(cookie);assert.equal(await auths[0].authenticateCookie(cookie),null);assert.equal(await auths[4].authenticateCookie(cookie),null);
  }finally{await f.close();}
});

test('暂停与清空跨实例生效，旧请求不会回填，重复清空不删除新一轮记录',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture(),b=await blessingsFixture({BLESSINGS_ROOM:f.room});
  try{
    const a=await b.instance(),other=await b.instance(),person=await f.participant(81);
    const operation=()=>new RoomOperations({pool:f.pool,room:f.room,secret:f.runtime.sessionSecret});
    const original=validateBlessing(payload());await a.service.store.save(original,'network');
    await f.service.conversation.enqueue(person.participantId,{requestId:randomUUID()},'start');
    await operation().pause(true,'owner');
    await assert.rejects(other.service.store.save(validateBlessing(payload()),'network'),{code:'INTERACTION_PAUSED'});
    assert.equal(await f.service.conversation.claim(),null);
    const preview=await operation().snapshot();assert.equal(preview.paused,true);
    const request={requestId:randomUUID(),token:preview.token,confirmation:'清空试运行数据'};
    const cleared=await operation().reset(request,'owner');assert.equal(cleared.generation,1);
    assert.equal(await f.identity.session('wedding_game='+person.token),null);
    assert.equal((await f.store.event()).published,false);assert.equal((await f.store.event()).config.questions.length,6);
    await operation().pause(false,'owner');
    await assert.rejects(other.service.store.save(original,'network'),{code:'ROOM_RESET'});
    const fresh=validateBlessing(payload({generation:1}));await other.service.store.save(fresh,'network');
    const again=await operation().reset(request,'owner');assert.equal(again.alreadyCleared,true);
    assert.equal((await a.service.store.history()).messages.length,1,'重放旧清理请求不影响新记录');
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM wedding_operation_audit WHERE room_id=$1 AND action='reset'",[f.room])).rows[0].count,1);
  }finally{await b.close();await f.pool.query('DELETE FROM wedding_room_operations WHERE room_id=$1',[f.room]);await f.pool.query('DELETE FROM wedding_operation_audit WHERE room_id=$1',[f.room]);await f.close();}
});


test('后台清理接口校验身份、来源、密码与在途任务',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture(),b=await blessingsFixture({BLESSINGS_ROOM:f.room});
  try{
    const instance=await b.instance(),origin=await f.server({blessings:instance.service});
    assert.equal((await gameRequest(origin,'/admin/api/operations')).status,401);
    const cookie=await adminLogin(origin),person=await f.participant(89);
    await f.service.conversation.enqueue(person.participantId,{requestId:randomUUID()},'start');
    const turn=await f.service.conversation.claim();assert.ok(turn);
    const cross=await fetch(origin+'/admin/api/operations/pause',{method:'POST',headers:{Cookie:cookie,Origin:'https://unrelated.test','Content-Type':'application/json'},body:JSON.stringify({paused:true})});assert.equal(cross.status,403);
    assert.equal((await gameRequest(origin,'/admin/api/operations/pause',{paused:true},cookie)).status,200);
    const preview=await(await gameRequest(origin,'/admin/api/operations',undefined,cookie)).json();assert.equal(preview.active,1);
    const body={requestId:randomUUID(),token:preview.token,confirmation:'清空试运行数据',password:'bad-password'};
    assert.equal((await gameRequest(origin,'/admin/api/operations/reset',body,cookie)).status,403);
    const busy=await gameRequest(origin,'/admin/api/operations/reset',{...body,password:'test-admin-password'},cookie);assert.equal((await busy.json()).error,'WORK_IN_PROGRESS');
    assert.equal((await f.store.participant(person.participantId)).participant.name,person.name);
    await gameRequest(origin,'/admin/api/operations/pause',{paused:false},cookie);assert.equal((await f.store.event()).published,true);
  }finally{await b.close();await f.pool.query('DELETE FROM wedding_room_operations WHERE room_id=$1',[f.room]);await f.pool.query('DELETE FROM wedding_operation_audit WHERE room_id=$1',[f.room]);await f.close();}
});
