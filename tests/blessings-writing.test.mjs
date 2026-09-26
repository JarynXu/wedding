import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,databaseUrl,payload,post,waitFor } from './blessings-fixture.mjs';
import { BlessingWriter } from '../server/blessings/writing.js';

test('AI写祝福使用独立限额，重试复用结果，不自动进入祝福簿',{skip:!databaseUrl&&'需要隔离数据库'},async()=>{
  let release,waiting=true,calls=0;
  const writing={configured:true,async compose(){calls++;if(waiting)await new Promise(resolve=>{release=resolve;});return '愿你们岁岁相伴，年年欢喜。';}};
  const f=await fixture({BLESSINGS_AI_HOURLY_LIMIT:'2'}, {writing});
  try{
    const {origin}=await f.instance();
    const write=body=>fetch(origin+'/api/blessings/polish',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const message=payload({text:'原稿祝福'}),first=write(message);
    await waitFor(()=>Boolean(release));assert.equal((await write(message)).status,429);assert.equal(calls,1);
    waiting=false;release();assert.equal((await first).status,200);
    const retry=await write(message);assert.equal(retry.status,200);assert.equal((await retry.json()).text,'愿你们岁岁相伴，年年欢喜。');assert.equal(calls,1);
    assert.equal((await write({...message,text:'不同原稿'})).status,409);
    const limited=await write(payload({clientId:message.clientId,text:''}));assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(calls,1);
    await f.db.query("UPDATE wedding_blessing_writing SET created_at=created_at-interval '21 seconds' WHERE room_id=$1",[f.config.room]);
    const second=await f.instance();
    const raced=await Promise.all(Array.from({length:5},(_,i)=>fetch((i%2?second.origin:origin)+'/api/blessings/polish',{method:'POST',headers:{Origin:i%2?second.origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload({clientId:message.clientId,text:''}))})));
    assert.equal(raced.filter(response=>response.status===200).length,1);assert.equal(raced.filter(response=>response.status===429).length,4);assert.equal(calls,2);
    await f.db.query("UPDATE wedding_blessing_writing SET created_at=created_at-interval '21 seconds' WHERE room_id=$1",[f.config.room]);
    const hourly=await write(payload({clientId:message.clientId,text:''}));assert.equal(hourly.status,429);assert.ok(Number(hourly.headers.get('retry-after'))>3000);
    assert.equal((await(await fetch(origin+'/api/blessings/history')).json()).messages.length,0);
    assert.equal((await post(origin,payload({clientId:message.clientId,text:'我自己决定送出这句祝福'}))).status,201);
  }finally{release?.();await f.close();}
});

test('润色只接收原稿与主题，非法输出不替换宾客草稿',async()=>{
  const writer=new BlessingWriter({model:'test',baseUrl:'https://example.invalid',key:'test'});
  let context;
  writer.client={async complete(input){context=input;return {text:JSON.stringify({text:'愿你们岁岁相伴，年年欢喜。'})};}};
  assert.equal(await writer.compose('祝你们幸福','chinese'),'愿你们岁岁相伴，年年欢喜。');
  assert.deepEqual(JSON.parse(context.messages[1].content),{theme:'chinese',originalBlessing:'祝你们幸福'});
  assert.equal(context.tools,undefined);
  writer.client={async complete(){return {text:JSON.stringify({text:'<script>不应使用</script>'})};}};
  await assert.rejects(writer.compose('原稿','classic'),{code:'AI_UNAVAILABLE'});
  writer.close();
});

test('空白祝福轮换创作角度，重复开头会在一次请求内重写',async()=>{
  const contexts=[],results=['今天的快乐延续到每一个平常的明天。','一起把三餐四季过成喜欢的模样。','以后的风雨有人分担，晴天有人分享。','两个人的远方，都有彼此的位置。','每个小心愿，都能被对方认真听见。','春秋轮转，你们依然是彼此的好朋友。','这杯敬今天，也敬以后的每个好日子。','家里常有笑声，心里总有牵挂。'];
  const writer=new BlessingWriter({model:'test'}, {async complete(input){contexts.push(JSON.parse(input.messages[1].content));return {text:JSON.stringify({text:results.shift()})};}});
  try {
    for(let i=0;i<8;i++)await writer.compose('','chinese');
    assert.equal(new Set(contexts.map(context=>context.direction.angle)).size,8);
    assert.ok(contexts.at(-1).recentBlessings.length>=7);
    const outputs=['良辰吉日，喜结良缘，愿你们幸福。','你们牵着的手，也牵住了往后的小欢喜。'];
    const rewrites=[];
    writer.client={async complete(input){rewrites.push(JSON.parse(input.messages[1].content));return {text:JSON.stringify({text:outputs.shift()})};}};
    assert.equal(await writer.compose('','classic'),'你们牵着的手，也牵住了往后的小欢喜。');
    assert.equal(rewrites.length,2);
    assert.match(rewrites[1].rejectedBlessing,/良辰吉日/);
    writer.client={async complete(){return {text:JSON.stringify({text:'你们牵着的手，也牵住了往后的小欢喜。'})};}};
    await assert.rejects(writer.compose('','classic'),{code:'AI_UNAVAILABLE'});
  } finally { writer.close(); }
});
