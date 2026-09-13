import test from 'node:test';
import assert from 'node:assert/strict';
import { guestReply } from '../server/game/reply.js';

test('旧聊天的错题评语与错题提问恢复为判分记录对应内容，原记录保留',()=>{
  const row={reply:{source:'ai',answerId:'9',answerVersion:1,questionId:'bride',questionText:'宾客几点进场？',messages:['新娘的名字也答对了！','宾客几点进场？'],choices:[]}};
  const before=JSON.stringify(row),reply=guestReply(row,[{id:'9',version:1,status:'correct'}],[{id:'bride',title:'新娘的名字是什么？'}]);
  assert.match(reply.messages[0],/答对|答中/);assert.doesNotMatch(reply.messages[0],/新娘/);
  assert.equal(reply.questionText,'新娘的名字是什么？');assert.doesNotMatch(reply.messages.join(''),/进场/);
  assert.equal(JSON.stringify(row),before);assert.equal(reply.source,'template');
});

test('同版本的待核对回答完成判分时，展示不能继续停留在核对中',()=>{
  const row={reply:{presentationVersion:2,answerId:'9',answerVersion:2,answerStatus:'judging',messages:['还在核对'],questionId:null,questionText:null}};
  const reply=guestReply(row,[{id:'9',version:2,status:'correct'}],[]);
  assert.match(reply.messages[0],/答对/);assert.equal(reply.answerStatus,'correct');
});

test('修复已判题回应时保留原有开场的提问细节',()=>{
  const row={reply:{questionId:'date',questionText:'请说出婚礼的日期与具体时间。',messages:['请说出婚礼的日期与具体时间。']}};
  assert.deepEqual(guestReply(row,[],[{id:'date',title:'婚礼何时举行？'}]),row.reply);
});

test('旧的请求选项回复不能伪装成已经判对',()=>{
  const row={question_id:'time',reply:{messages:['11:30，答对啦！','这一分收得漂亮。'],choices:['11:30','12:00'],questionId:'time'}};
  const missing=guestReply(row,[],[]);assert.doesNotMatch(missing.messages.join(''),/答对啦|这一分/);assert.match(missing.messages[0],/再选/);
  assert.match(guestReply(row,[{id:'another',questionId:'time',status:'correct'}],[]).messages[0],/已记下/);
});
