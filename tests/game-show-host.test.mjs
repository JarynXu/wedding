import test from 'node:test';
import assert from 'node:assert/strict';
import { ShowHost } from '../server/game/show-host.js';
import { publicGameRules } from '../src/game-rules.js';
import { publicWeddingFacts } from '../server/game/public-context.js';
import { WEDDING_CONFIG } from '../src/config.js';
import { initialGameConfig } from '../server/game/model.js';
import { gameOpeningInvitation } from '../src/game-rules.js';

const context={scene:'score',shouldAsk:false,score:1,answered:2,pending:0,variantSeed:0,recent:[],deck:{id:'q1',phrasings:['第一次旅行去了哪座城市？'],hints:['想想旅途里的湖水。'],choices:['杭州','上海','南京','苏州']}};
test('开场先说明活动资格，不把达标说成人人获奖，不公开主持要求',()=>{
  const config=initialGameConfig();config.requiredCorrect=3;config.maxWinners=15;config.prizes.participation='纪念熊';
  const invitation=gameOpeningInvitation(config),host=new ShowHost(null);
  const reply=host.render({...context,scene:'welcome',shouldAsk:true,invitation},{messages:['咱们不紧不慢地聊，我会用轻松的方式陪你。','{{question}}'],help:'none',quickReplies:['我负责活跃气氛','慢慢聊聊吧']},'ai');
  assert.match(reply.messages.join(''),/答对 3 题.*前 15 位.*纪念熊/s);
  assert.ok(reply.messages.indexOf(invitation)<reply.messages.indexOf(reply.questionText));
  assert.doesNotMatch(reply.messages.join(''),/不紧不慢|我会用|轻松的方式|我负责/);assert.deepEqual(reply.quickReplies,[]);
});
test('主持人公开资料包含完整规则和婚礼日程，不包含答案、评分依据或私人联系方式',()=>{
  const config=initialGameConfig();config.questions[0].answer='私有答案';config.judgeInstructions='私有评分说明';
  const rules=publicGameRules(config),wedding=publicWeddingFacts(WEDDING_CONFIG),text=JSON.stringify({rules,wedding});
  assert.doesNotMatch(text,/私有答案|私有评分说明|13800000000|13900000000|assets|captcha|key/);
  for(const value of ['20','30天','小玩偶','一次','2026/10/17 00:00:00','嘉臣','11:30','11:58','12:28','三楼'])assert.ok(text.includes(value),value);
});
test('主持人保留自然接话，成绩与线索标记不会泄漏或重复拼接',()=>{
  const host=new ShowHost(null);
  const reply=host.render(context,{messages:['我替你看一眼～','目前你答对了 {{score}} 题。','{{score}}'],variant:0,help:'none',quickReplies:['我选杭州','给点提示']},'ai');
  assert.deepEqual(reply.messages,['我替你看一眼～','你目前答对 1 题，已经聊过 2 个问题。']);
  assert.deepEqual(reply.quickReplies,['给点提示']);
  const invalid=host.render(context,{messages:['你答对六题了','{{internal_value}}'],help:'none'},'ai');
  assert.doesNotMatch(invalid.messages.join(''),/六题|internal_value|[{}]/);
  assert.match(invalid.messages.join(''),/答对 1 题/);
  const pronoun=host.render({...context,scene:'welcome',shouldAsk:true},{messages:['你们第一次出游去哪里？'],approvedQuestion:'你们第一次出游去哪里？',help:'none'},'ai');
  assert.doesNotMatch(pronoun.messages.join(''),/你们/);assert.match(pronoun.messages.join(''),/第一次旅行/);
  const clue=host.render({...context,scene:'hint'},{messages:['提示来了：想想旅途里的湖水。'],help:'hint'},'ai');
  assert.equal(clue.messages.join('').match(/想想旅途里的湖水/g).length,1);
  const reordered=host.render(context,{messages:['{{question}}','{{score}}'],help:'none'},'ai');
  assert.match(reordered.messages[0],/答对 1 题/);
});
test('发言核对失败时不得使用未经核对的线索；主动接话可选择沉默',async()=>{
  const host=new ShowHost({model:'host',reviewModel:'review',baseUrl:'https://example.invalid',key:'test'});
  let calls=0;
  host.client={async complete(){if(++calls===1)return {text:JSON.stringify({messages:['答案是香蕉，它黄澄澄的'],variant:0,help:'none',quickReplies:[]})};throw Error('核对中断');}};
  const reply=await host.speak(context,new AbortController().signal);
  assert.doesNotMatch(reply.messages.join(''),/香蕉|黄澄澄/);assert.equal(reply.source,'template');
  const quiet=host.render({...context,scene:'nudge'},{messages:[],help:'none',quickReplies:[]},'ai');assert.deepEqual(quiet.messages,[]);
});

test('宾客一条消息问多个事项时，遗漏部分会触发补全并再次核对',async()=>{
  const host=new ShowHost({model:'host',reviewModel:'review',baseUrl:'https://example.invalid',key:'test'});
  const replies=[
    {messages:['婚礼在嘉臣酒店。'],variant:0,help:'none',quickReplies:[]},
    {keepMessages:[0],keepQuickReplies:[],questionMessage:null,unansweredRequests:['几点到？']},
    {messages:['婚礼在嘉臣酒店。','11:30宾客进场。'],variant:0,help:'none',quickReplies:[]},
    {keepMessages:[0,1],keepQuickReplies:[],questionMessage:null,unansweredRequests:[]},
  ];
  const calls=[];host.client={async complete(call){calls.push(call);return {text:JSON.stringify(replies.shift())};}};
  const reply=await host.speak({...context,scene:'wedding',guestMessage:'在哪办？几点到？'},new AbortController().signal);
  assert.deepEqual(reply.messages,['婚礼在嘉臣酒店。','11:30宾客进场。']);assert.equal(calls.length,4);
  assert.match(JSON.stringify(calls[2].messages),/几点到/);
});
