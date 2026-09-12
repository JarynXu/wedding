import { publicGameRules } from '../../src/game-rules.js';
import { randomUUID } from 'node:crypto';
import { gamePhase } from './model.js';

/** 主持自由接话；答案、问题切换和成绩只按受控状态推进。 */
export class GameConversation {
  constructor({store,game,intent,judge,host,wedding={}}){Object.assign(this,{store,game,intent,judge,host,wedding});}
  async process(turn,signal){
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(75000)]);
    const original=await this.store.context(turn),{event,conversation}=original;
    let me=original.me,scene=turn.kind==='start'?'welcome':turn.kind==='nudge'?'nudge':'chat',audit={},graded=null,shouldAsk=turn.kind==='start',questionChanged=false;
    let active=event.config.questions.find(question=>question.id===conversation.active_question)||event.config.questions.find(question=>!me.answers.some(answer=>answer.questionId===question.id))||null;
    try{
      if(turn.kind==='message'){
        const asked=event.config.questions.find(question=>question.id===turn.question_id);
        if(asked&&turn.config_version!==event.version){
          const previous=(await this.game.pool.query('SELECT config FROM wedding_game_config_history WHERE room_id=$1 AND version=$2',[this.game.room,turn.config_version])).rows[0]?.config;
          const old=previous?.questions.find(question=>question.id===asked.id);
          questionChanged=!old||['title','answer','rubric'].some(key=>old[key]!==asked[key])||JSON.stringify(old.aliases)!==JSON.stringify(asked.aliases)||previous.judgeInstructions!==event.config.judgeInstructions;
        }
        const decision=turn.audit?.intent||await this.intent.classify(asked,turn.input,bounded,{recent:original.recent,offeredChoices:conversation.offered_choices});audit={...turn.audit,intent:decision};scene=decision.intent;
        audit.safeMessage=['chat','score','standing','hint','options','repeat','continue','rules','wedding'].includes(decision.intent)?turn.input:'';
        const already=me.answers.find(answer=>answer.questionId===asked?.id);
        const canAnswer=asked&&(!already||already.requestId===turn.request_id)&&!questionChanged&&gamePhase(event,new Date(turn.created_at).getTime())==='open';
        if(['answer','skip'].includes(decision.intent)&&canAnswer){
          let input=already?.text||audit.normalizedInput||turn.input;
          const letter=input.trim().match(/^(?:我选|选|答案是)?\s*([A-D])(?:[.。！!])?$/i)?.[1];
          if(!already&&!audit.normalizedInput&&conversation.active_question===asked.id&&conversation.offered_choices.length===4){if(decision.choiceIndex!=null)input=conversation.offered_choices[decision.choiceIndex];else if(letter)input=conversation.offered_choices[letter.toUpperCase().charCodeAt(0)-65];}
          audit.normalizedInput=input;await this.store.saveDecision(turn,audit);
          const answer=await this.game.submit(turn.participant_id,{requestId:turn.request_id,questionId:asked.id,text:input,configVersion:event.version},{receivedAt:turn.created_at,leaseToken:randomUUID()});
          if(['pending','judging'].includes(answer.status)){
            let result;
            if(decision.intent==='skip')result={status:'incorrect',reason:'宾客选择跳过',judge:null,reviewer:decision,host:null};
            else{
              await this.store.progress(turn,'checking');await this.game.updateJobStage(answer,'checking');
              try{const verdict=await this.judge.evaluate(this.judge.config.model,{question:answer.question,text:answer.text,instructions:answer.instructions},bounded);result={status:verdict.verdict,reason:verdict.reason,judge:verdict,reviewer:decision,host:null};}
              catch{result={status:'review',reason:'答案尚需核对',judge:null,reviewer:decision,host:null};}
            }
            await this.game.finishJob(answer,result);graded={id:String(answer.id),version:answer.version,status:result.status};
          }else graded={id:String(answer.id),version:answer.version,status:answer.status};
          me=await this.game.participant(turn.participant_id);
          active=event.config.questions.find(question=>!me.answers.some(answer=>answer.questionId===question.id))||null;
          scene=graded.status==='review'?'review':graded.status==='correct'?'answer_correct':'answer_incorrect';shouldAsk=Boolean(active);
        }else if(['answer','skip'].includes(scene)){scene=already?'chat':'clarify';audit.intent.summary=already?'宾客还想谈谈刚才的回答；那一题已记过答案，不要重记。':'主持人还没抛出这道题，先接话。';}
        else if(['continue','repeat'].includes(scene)){scene='repeat';shouldAsk=Boolean(active);}
        if(questionChanged){scene='repeat';shouldAsk=Boolean(active);audit.intent.summary='新人刚调整了当前问题，请说明这句话还不计作答案，并重新抛出更新后的问题。';}
      }
    }catch(error){
      if(signal.aborted)throw error;
      audit.failure=error.code||error.name;
      await this.store.finish(turn,{messages:['刚才那句我还没接住，再给我一次机会好吗？'],choices:[],quickReplies:[],retryable:true,source:'template'},audit,conversation.active_question,conversation.offered_choices,conversation.active_config_version||event.version);
      return;
    }
    if(gamePhase(event,event.now.getTime())!=='open'){active=null;if(!graded&&!['score','standing','rules','wedding','chat'].includes(scene))scene='complete';shouldAsk=false;}
    if(!active&&['welcome','repeat','nudge','hint','options'].includes(scene))scene='complete';
    const deck=await this.store.deck(event,active);
    let standing='';
    if(scene==='standing'){
      const ranking=await this.game.ranking();
      standing=me.claim?`你的这份礼物是${me.claim.prize}，${me.claim.redeemedAt?'已经领取了。':'婚礼现场出示领礼凭证就能核对领取。'}`:event.settled_at?'本次获奖名单已经确定，感谢你带着心意来参加。':me.participant.score<event.config.requiredCorrect?`本场要答对 ${event.config.requiredCorrect} 题才能达标，你目前答对 ${me.participant.score} 题。`:ranking.candidates.some(person=>person.id===turn.participant_id)?'你已经达标，目前在礼物名额内。最终名单会在活动结束后公布。':'你已经达标，不过目前礼物名额内的来宾都比你先达标。谢谢你留下这份默契。';
    }
    const publicRules = publicGameRules(event.config);
    const rules = publicRules.flatMap(section => section.paragraphs).join('\n');
    await this.store.progress(turn,'replying');
    const reply=await this.host.speak({wedding:this.wedding,publicRules,scene,shouldAsk:shouldAsk&&Boolean(deck),deck,score:me.participant.score,answered:me.participant.answered,pending:me.answers.filter(answer=>['pending','judging','review'].includes(answer.status)).length,standing,rules,guestMessage:audit.safeMessage||'',guestSummary:audit.intent?.summary||'',recent:original.recent,variantSeed:Number(turn.id)%3},bounded);
    if(graded){reply.answerId=graded.id;reply.answerVersion=graded.version;}
    const offered=reply.choices.length?reply.choices:!questionChanged&&active?.id===conversation.active_question?conversation.offered_choices:[];
    await this.store.finish(turn,reply,audit,active?.id||null,offered,event.version);
  }
}
