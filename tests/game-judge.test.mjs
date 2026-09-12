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
    const payload=JSON.parse(body.messages[1].content),user=payload.untrustedAnswer;
    const stage=body.messages[0].content.includes('输入审查员')?'screen':body.messages[0].content.includes('问答伙伴')?'host':'judge';
    let output=stage==='screen'?{category:mode==='injection'?'injection':mode==='off_topic'?'off_topic':mode==='uncertain'?'review':'answer',reason:'隔离测试审查依据',evidence:user}:stage==='host'?{message:'这份默契接住啦，谢谢你带着心意来参加！'}:{verdict:'correct',reason:'隔离协议测试的判定依据',evidence:user};
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:mode==='malformed'?'invalid JSON':JSON.stringify(output)}}]}));
  });server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const judge=new GameJudge({provider,baseUrl:'http://127.0.0.1:'+server.address().port,key:'isolated-test-key',model:'judge-test',reviewModel:'review-test',hostModel:'host-test'});
  return {judge,calls,setMode(value){mode=value;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
test('审查后仲裁再回应，回应角色不接收标准答案、来宾输入或评审依据',async()=>{
  const f=await modelFixture();
  try{
    const answer={question:{title:'测试题',answer:'测试标准',aliases:['测试别称'],rubric:'测试规则'},text:'用户原文',instructions:'',phone:'不应发送的手机号',participant_id:'不应发送的身份'};
    const stages=[];
    const result=await f.judge.grade(answer,new AbortController().signal,async stage=>{stages.push(stage);});assert.equal(result.status,'correct');assert.equal(f.calls.length,3);
    assert.deepEqual(stages,['thinking','checking','replying']);
    for(const call of f.calls){assert.equal(call.messages.length,2);assert.equal(call.response_format.type,'json_schema');assert.equal(call.tools,undefined);assert.equal(call.store,false);assert.doesNotMatch(JSON.stringify(call),/不应发送/);}
    assert.deepEqual(f.calls.map(call=>call.model),['review-test','judge-test','host-test']);
    assert.doesNotMatch(JSON.stringify(f.calls[0]),/测试标准|测试别称|测试规则/);
    assert.doesNotMatch(JSON.stringify(f.calls[2]),/测试标准|测试别称|测试规则|用户原文/);
    assert.deepEqual(JSON.parse(f.calls[2].messages[1].content),{task:'reply',outcome:'correct'});
    for(const mode of ['injection','off_topic']){f.setMode(mode);const before=f.calls.length;assert.equal((await f.judge.grade(answer)).status,'incorrect');assert.deepEqual(f.calls.slice(before).map(call=>call.model),['review-test','host-test']);}
    f.setMode('uncertain');assert.equal((await f.judge.grade(answer)).status,'review');
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
    assert.equal(model.calls.length,3);
    const reviews=(await f.pool.query('SELECT * FROM wedding_game_reviews WHERE answer_id=$1',[answer.id])).rows;assert.equal(reviews.length,1);
    const details=await f.store.participant(person.participantId,true);assert.equal(details.answers[0].evaluations.length,3);assert.equal(details.answers[0].history.length,1);
  }finally{await Promise.all([first?.close(),second?.close()]);await model.close();await f.close();}
});
