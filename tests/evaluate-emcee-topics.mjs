import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gameFixture, gameTestDatabase } from './game-fixture.mjs';
import { readGameRuntime } from '../server/game/config.js';
import { ConversationIntent } from '../server/game/conversation-intent.js';
import { GameConversation } from '../server/game/conversation.js';
import { GameJudge } from '../server/game/judge.js';
import { ShowHost } from '../server/game/show-host.js';

if(!process.argv.includes('--live')||!['127.0.0.1','localhost'].includes(new URL(gameTestDatabase).hostname))throw Error('仅供显式启用的本机隔离评测');
const config=readGameRuntime().ai;if(!config)throw Error('缺少模型配置');
await mkdir('.temp/reports', { recursive: true });
const f=await gameFixture(),cases=[];
try{
  const event=await f.store.event();
  const questions=[['婚礼仪式在什么时候举行？','2026年10月17日11:58','10月17日',0],['婚礼在哪举行？','松风礼堂','松风礼堂',1],['新郎的名字是什么？','周明朗','周明朗',2],['新娘的名字是什么？','林一宁','林一宁',3],['宾客几点入场？','11:30','十一点半',4],['喜宴几点开席？','12:28','12:58',4]];
  event.config.questions=questions.map(([title,answer],i)=>({id:'q'+(i+1),title,answer,aliases:[],rubric:i===0?'必须说出日期和具体时间，缺少时间算不正确。':'接受同义表达。'}));
  await f.store.saveConfig({expectedVersion:event.version,config:event.config},'isolated-evaluation');
  for(const question of event.config.questions)await f.pool.query('UPDATE wedding_game_question_voice SET deck=$3 WHERE room_id=$1 AND question_id=$2 AND config_version=3',[f.room,question.id,{phrasings:[question.title],hints:[],choices:question.id==='q5'?['11:30','12:28','12:00','11:58']:question.id==='q6'?['12:28','12:58','11:58','11:30']:[],source:'evaluation'}]);
  const {participantId}=await f.participant(97);
  const show=new GameConversation({store:f.service.conversation,game:f.store,intent:new ConversationIntent(config),judge:new GameJudge(config),host:new ShowHost(config),wedding:{groom:'周明朗',bride:'林一宁',date:'2026年10月17日',venue:{name:'松风礼堂'},schedule:[{time:'11:30',title:'宾客入场'},{time:'11:58',title:'婚礼仪式'},{time:'12:28',title:'喜宴开席'}]}});
  await f.service.conversation.enqueue(participantId,{requestId:randomUUID()},'start');await show.process(await f.service.conversation.claim(),new AbortController().signal);
  for(let index=0;index<questions.length;index++){
    const [title,,rawInput,score]=questions[index];let choice=null,input=rawInput;
    if(index>=4){
      await f.service.conversation.enqueue(participantId,{requestId:randomUUID(),text:'给几个选项',suggestion:'给几个选项'});await show.process(await f.service.conversation.claim(),new AbortController().signal);
      const offer=(await f.service.conversation.snapshot(participantId)).turns.at(-1);input=index===4?'11:30':'12:58';choice={offerId:offer.id,index:offer.reply.choices.indexOf(input)};
      if(choice.index<0)throw Error('没有给出对应题目的选项');
    }
    await f.service.conversation.enqueue(participantId,{requestId:randomUUID(),text:input,...(choice?{choice}: {})});
    await show.process(await f.service.conversation.claim(),new AbortController().signal);
    const me=await f.store.participant(participantId),reply=(await f.service.conversation.snapshot(participantId)).turns.at(-1).reply;
    const reaction=reply.messages.filter(message=>message!==reply.questionText).join('');
    const noFutureClaim=!/六题全对的节奏|把礼物往手里攒|稳拿.*奖/.test(reaction)&&(!(index===questions.length-1)||!/下一题|继续猜|再猜/.test(reaction));
    const pass=reply.quickReplies.length===2&&reply.choices.length===0&&noFutureClaim&&me.participant.score===score&&reply.questionText===(questions[index+1]?.[0]||null)&&(!questions[index+1]||!reaction.includes(questions[index+1][1]));
    cases.push({title,input,score:me.participant.score,expectedScore:score,reply,pass});console.log(JSON.stringify(cases.at(-1)));
  }
  const report={evaluatedAt:new Date().toISOString(),model:config.model,scope:'虚构婚礼、六道相邻话题、真实模型、本机隔离数据库；下一题采用预先核对的题目提法，不发送短信。',passed:cases.filter(item=>item.pass).length,total:cases.length,cases};
  await writeFile('.temp/reports/choice-dialogue-evaluation.json',JSON.stringify(report,null,2)+'\n');if(report.passed!==report.total)process.exitCode=1;
}finally{await f.close();}
