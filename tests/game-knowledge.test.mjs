import test from 'node:test';
import assert from 'node:assert/strict';
import { gameFixture, gameTestDatabase, gameRequest, adminLogin } from './game-fixture.mjs';
import { upgradePrizePolicy } from '../server/game/prize-policy-upgrade.js';

test('奖项升级保留旧配置和题目素材，重复升级不改版本',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture();
  try{
    const event=await f.store.event(),legacy={...event.config,maxWinners:20};delete legacy.participationLimit;delete legacy.prizePolicy;
    await f.pool.query('UPDATE wedding_games SET config=$2 WHERE room_id=$1',[f.room,legacy]);
    const result=await upgradePrizePolicy(f.pool,f.room);assert.equal(result.changed,true);assert.equal(result.participationLimit,20);
    const current=await f.store.event();assert.equal(current.version,event.version+1);assert.equal(current.config.prizePolicy,'perfect-six-v1');
    const previous=(await f.pool.query('SELECT config FROM wedding_game_config_history WHERE room_id=$1 AND version=$2',[f.room,event.version])).rows[0];assert.equal(previous.config.maxWinners,20);
    assert.deepEqual(await upgradePrizePolicy(f.pool,f.room),{changed:false});assert.equal((await f.store.event()).version,current.version);
  }finally{await f.close();}
});

test('公开现场资料独立保存，访客无编辑权，关闭后不进入主持人资料',{skip:!gameTestDatabase&&'需要隔离数据库'},async()=>{
  const f=await gameFixture();
  try{
    const origin=await f.server(),cookie=await adminLogin(origin),knowledge=f.service.knowledge;
    const before=await f.store.event();assert.deepEqual(await knowledge.forHost(),[]);
    const body={expectedVersion:0,enabled:true,entries:[{question:'现场的小暗号是什么？',answer:'同心同行',teaser:'婚礼现场还有一句同心的小暗号。'}]};
    assert.equal((await gameRequest(origin,'/admin/api/game/knowledge',body,undefined,'PUT')).status,401);
    const saved=await gameRequest(origin,'/admin/api/game/knowledge',body,cookie,'PUT');assert.equal(saved.status,200);
    assert.equal((await knowledge.forHost())[0].answer,'同心同行');assert.equal((await f.store.event()).version,before.version,'现场资料不更改计分规则版本');
    assert.doesNotMatch(await(await gameRequest(origin,'/api/game/config')).text(),/同心同行|测试答案/);
    assert.equal((await gameRequest(origin,'/admin/api/game/knowledge',body,cookie,'PUT')).status,409);
    await knowledge.save({...body,expectedVersion:1,enabled:false},'tester');assert.deepEqual(await knowledge.forHost(),[]);
    await assert.rejects(knowledge.save({...body,expectedVersion:2,entries:[{question:'缺少回答',answer:''}]},'tester'),{code:'INVALID_INPUT'});
  }finally{await f.close();}
});
