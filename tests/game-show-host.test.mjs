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
  const config=initialGameConfig();config.requiredCorrect=3;config.participationLimit=15;config.prizes.participation='纪念熊';
  const invitation=gameOpeningInvitation(config),host=new ShowHost(null);
  const reply=host.render({...context,scene:'welcome',shouldAsk:true,invitation},{messages:['咱们不紧不慢地聊，我会用轻松的方式陪你。','{{question}}'],help:'none',quickReplies:['我负责活跃气氛','慢慢聊聊吧']},'ai');
  assert.match(reply.messages.join(''),/答对 3 题.*另有 15 份.*纪念熊/s);
  assert.ok(reply.messages.indexOf(invitation)<reply.messages.indexOf(reply.questionText));
  assert.doesNotMatch(reply.messages.join(''),/不紧不慢|我会用|轻松的方式|我负责/);assert.equal(reply.quickReplies.length,2);assert.ok(reply.quickReplies.every(value=>!/我负责|慢慢聊/.test(value)));
});
test('主持人公开资料包含完整规则和婚礼日程，不包含答案、评分依据或私人联系方式',()=>{
  const config=initialGameConfig();config.questions[0].answer='私有答案';config.judgeInstructions='私有评分说明';
  const rules=publicGameRules(config),wedding=publicWeddingFacts(WEDDING_CONFIG),text=JSON.stringify({rules,wedding});
  assert.doesNotMatch(text,/私有答案|私有评分说明|13800000000|13900000000|assets|captcha|key/);
  for(const value of ['20','钥匙扣小玩偶','一次','2026年10月16日 24:00','嘉臣','11:30','11:58','12:28','三楼'])assert.ok(text.includes(value),value);
});
test('主持人保留自然接话，成绩与线索标记不会泄漏或重复拼接',()=>{
  const host=new ShowHost(null);
  const reply=host.render(context,{messages:['我替你看一眼～','目前你答对了 {{score}} 题。','{{score}}'],variant:0,help:'none',quickReplies:['我选杭州','给点提示']},'ai');
  assert.deepEqual(reply.messages,['我替你看一眼～','你目前答对 1 题，已经聊过 2 个问题。']);
  assert.deepEqual(reply.quickReplies,['给点提示','给几个选项']);
  const invalid=host.render(context,{messages:['你答对六题了','{{internal_value}}'],help:'none'},'ai');
  assert.doesNotMatch(invalid.messages.join(''),/六题|internal_value|[{}]/);
  assert.match(invalid.messages.join(''),/答对 1 题/);
  const pronoun=host.render({...context,scene:'welcome',shouldAsk:true},{messages:['你们第一次出游去哪里？'],approvedQuestion:'你们第一次出游去哪里？',help:'none'},'ai');
  assert.doesNotMatch(pronoun.messages.join(''),/你们/);assert.match(pronoun.messages.join(''),/第一次旅行/);
  const clue=host.render({...context,scene:'hint'},{messages:['提示来了：想想旅途里的湖水。'],help:'hint'},'ai');
  assert.equal(clue.messages.join('').match(/想想旅途里的湖水/g).length,1);
  const reordered=host.render(context,{messages:['{{question}}','{{score}}'],help:'none'},'ai');
  assert.match(reordered.messages[0],/答对 1 题/);
  const backstage=host.render({...context,scene:'onsite',purpose:'guest-assistant',deck:null},{messages:['暗号是同心同行。','这是新人允许公开的答案，直接告诉你啦。'],help:'none'},'ai');
  assert.deepEqual(backstage.messages,['暗号是同心同行。']);
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


test('本题回应只得到已判题意，下一题由审定提法承接',async()=>{
  const calls=[],host=new ShowHost({model:'host',reviewModel:'review'},{async complete(call){calls.push(call);return {text:JSON.stringify(calls.length===1?{messages:['地点这题答对啦！'],variant:0,help:'none',quickReplies:[]}:{keepMessages:[0],keepQuickReplies:[],questionMessage:null,resultConsistent:true,unansweredRequests:[]})};}});
  const input={...context,scene:'answer_correct',shouldAsk:true,completedTurn:{questionId:'place',title:'婚礼在哪举行？',outcome:'correct'},deck:{id:'groom',phrasings:['新郎的名字是什么？'],hints:[],choices:[]},wedding:{groom:'下一题名字'},guestMessage:'不可传给回应者的答案',recent:[{role:'host',text:'错误历史中的下一题名字'}]};
  const reply=await host.speak(input,new AbortController().signal);
  assert.ok(calls.every(call=>!JSON.stringify(call.messages).includes('下一题名字')));
  assert.ok(calls.every(call=>!JSON.stringify(call.messages).includes('不可传给回应者的答案')));
  assert.match(JSON.stringify(calls[0].messages),/婚礼在哪举行/);
  assert.deepEqual(reply.messages,['地点这题答对啦！','新郎的名字是什么？']);assert.equal(reply.presentationVersion,2);
});

test('发言核对误认了自由改写的题目时，公开提问仍绑定原题',async()=>{
  let calls=0;const host=new ShowHost({model:'host',reviewModel:'review'},{async complete(){return {text:JSON.stringify(++calls===1?{messages:['宾客几点进场？'],variant:0,help:'none',quickReplies:[]}:{keepMessages:[0],keepQuickReplies:[],questionMessage:0,resultConsistent:true,unansweredRequests:[]})};}});
  const reply=await host.speak({...context,scene:'repeat',shouldAsk:true,deck:{id:'bride',phrasings:['新娘的名字是什么？'],hints:[],choices:[]}},new AbortController().signal);
  assert.equal(reply.questionId,'bride');assert.equal(reply.questionText,'新娘的名字是什么？');assert.doesNotMatch(reply.messages.join(''),/进场/);
});

test('错位的答题评语未通过核对时仍明确反馈本题判定',async()=>{
  let calls=0;const host=new ShowHost({model:'host',reviewModel:'review'},{async complete(){return {text:JSON.stringify(++calls===1?{messages:['新郎的名字答对了，是周明朗！'],variant:0,help:'none',quickReplies:[]}:{keepMessages:[],keepQuickReplies:[],questionMessage:null,resultConsistent:false,unansweredRequests:[]})};}});
  const reply=await host.speak({...context,scene:'answer_correct',shouldAsk:true,completedTurn:{questionId:'place',title:'婚礼在哪举行？',outcome:'correct'}},new AbortController().signal);
  assert.match(reply.messages[0],/答对/);assert.doesNotMatch(reply.messages.join(''),/周明朗|新郎/);assert.equal(reply.source,'template');
});

test('要选项时不宣称已经答对，也不在正文重复列出四个候选',()=>{
  const host=new ShowHost(null),reply=host.render({...context,scene:'options'},{messages:['杭州，答对啦！','杭州、上海、南京、苏州'],help:'choices',quickReplies:['能给我一点线索吗？']},'ai');
  assert.equal(reply.choices.length,4);assert.doesNotMatch(reply.messages.join(''),/答对啦|杭州、上海/);
  assert.equal(reply.quickReplies.length,2);assert.ok(reply.quickReplies.includes('能给我一点线索吗？'),'保留经过核对的自然接话建议');
  const invitation=host.render(context,{messages:['想看看自己的得分吗？'],quickReplies:['我想看看成绩']},'ai');
  assert.ok(invitation.messages.includes('想看看自己的得分吗？'),'询问是否查分不等于宣布本题判分');
});
