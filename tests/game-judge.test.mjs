import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { GameJudge } from '../server/game/judge.js';
import { createGameService } from '../server/game/service.js';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';
import { waitFor } from './blessings-fixture.mjs';

async function modelFixture(provider='openai-compatible') {
  const calls=[];let mode='agree';
  const server=createServer(async(request,response)=>{
    let raw='';for await(const part of request)raw+=part;
    const body=JSON.parse(raw);calls.push(body);
    const user=JSON.parse(body.messages[1].content).untrustedAnswer;
    const verdict=mode==='disagree'&&body.model==='review-test'?'incorrect':'correct';
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:mode==='malformed'?'invalid JSON':JSON.stringify({verdict,reason:'隔离协议测试的判定依据',evidence:user})}}]}));
  });server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const judge=new GameJudge({provider,baseUrl:'http://127.0.0.1:'+server.address().port,key:'isolated-test-key',model:'judge-test',reviewModel:'review-test'});
  return {judge,calls,setMode(value){mode=value;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
test('判题与盲审只传必要上下文，意见冲突或无效响应转人工复核',async()=>{
  const f=await modelFixture();
  try{
    const answer={question:{title:'测试题',answer:'测试标准',aliases:['测试别称'],rubric:'测试规则'},text:'用户原文',instructions:'',phone:'不应发送的手机号',participant_id:'不应发送的身份'};
    const result=await f.judge.grade(answer,new AbortController().signal);assert.equal(result.status,'correct');assert.equal(f.calls.length,2);
    for(const call of f.calls){assert.equal(call.messages.length,2);assert.equal(call.response_format.type,'json_schema');assert.equal(call.tools,undefined);assert.equal(call.store,false);assert.doesNotMatch(JSON.stringify(call),/不应发送/);assert.deepEqual(JSON.parse(call.messages[1].content),{untrustedAnswer:'用户原文'});}
    f.setMode('disagree');assert.equal((await f.judge.grade(answer,new AbortController().signal)).status,'review');
    f.setMode('malformed');assert.equal((await f.judge.grade(answer,new AbortController().signal)).status,'review');
  }finally{await f.close();}
});

test('DeepSeek JSON Output 使用供应商协议，截断或格式错误不得产生正确成绩',async()=>{
  const f=await modelFixture('deepseek');
  try{
    const answer={question:{title:'测试题',answer:'测试标准',aliases:[],rubric:''},text:'测试标准',instructions:''};
    assert.equal((await f.judge.grade(answer)).status,'correct');
    for(const call of f.calls){
      assert.deepEqual(call.response_format,{type:'json_object'});
      assert.deepEqual(call.thinking,{type:'disabled'});
      assert.equal(call.max_tokens,800);
      assert.equal(call.max_completion_tokens,undefined);
      assert.equal(call.store,undefined);
    }
    f.setMode('malformed');assert.equal((await f.judge.grade(answer)).status,'review');
    f.setMode('truncated');assert.equal((await f.judge.grade(answer)).status,'review');
  }finally{await f.close();}
});

test('两个工作实例共享判题队列，同一答案只落一份评审记录',{skip:!gameTestDatabase&&'需要隔离PostgreSQL',timeout:20000},async()=>{
  const f=await gameFixture(),model=await modelFixture();let first,second;
  try{
    const person=await f.participant(60);
    const answer=await f.store.submit(person.participantId,{requestId:randomUUID(),questionId:'q1',text:'协议测试答案',configVersion:2});
    const options={database:{connectionString:gameTestDatabase,ssl:false,max:3},room:f.room,runtime:f.runtime,sms:f.sms,captcha:f.captcha,judge:model.judge};
    first=createGameService(options);second=createGameService(options);
    await waitFor(async()=> (await f.store.participant(person.participantId)).answers[0].status==='correct');
    assert.equal(model.calls.length,2);
    const reviews=(await f.pool.query('SELECT * FROM wedding_game_reviews WHERE answer_id=$1',[answer.id])).rows;assert.equal(reviews.length,1);
    const details=await f.store.participant(person.participantId,true);assert.equal(details.answers[0].evaluations.length,2);assert.equal(details.answers[0].history.length,1);
  }finally{await Promise.all([first?.close(),second?.close()]);await model.close();await f.close();}
});
