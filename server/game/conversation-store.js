import { randomUUID } from 'node:crypto';
import { GameError,gamePhase,text,uuid } from './model.js';
import { fallbackDeck } from './question-deck.js';
import { numericId } from './store.js';
import { traceContext, log } from '../observability.js';
import { guestReply } from './reply.js';

/** 一位宾客的对话顺序、当前问题和重复消息由数据库拥有。 */
export class ConversationStore {
  constructor(game){this.game=game;this.pool=game.pool;this.room=game.room;}
  async enqueue(participantId,body,kind='message'){
    const requestId=uuid(body.requestId),input=kind==='message'?text(body.text,'消息',320):'';
    return this.game.transaction(async client=>{
      const event=await this.game.event(client);
      if(!event.published)throw new GameError('NOT_OPEN','喜宴司仪还在准备，稍后再来看看。',409);
      await client.query('INSERT INTO wedding_game_conversations(participant_id,room_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[participantId,this.room]);
      const conversation=(await client.query('SELECT * FROM wedding_game_conversations WHERE participant_id=$1 AND room_id=$2 FOR UPDATE',[participantId,this.room])).rows[0];
      const prior=(await client.query('SELECT * FROM wedding_game_chat_turns WHERE participant_id=$1 AND request_id=$2',[participantId,requestId])).rows[0];
      if(prior){
        if(prior.input!==input||prior.kind!==kind)throw new GameError('REQUEST_CONFLICT','这句话已经改变，请重新发送。',409);
        if(prior.reply?.retryable){
          if(prior.attempts>=3&&event.now.getTime()-new Date(prior.last_attempt_at).getTime()<60000)throw new GameError('CHAT_BUSY','让我歇一小会儿，再来接这句话。',429,60);
          await client.query("UPDATE wedding_game_chat_turns SET state='pending',reply=NULL WHERE id=$1 AND state='complete'",[prior.id]);
        }
        return {id:String(prior.id)};
      }
      if(kind==='start'){
        const start=(await client.query("SELECT id FROM wedding_game_chat_turns WHERE participant_id=$1 AND kind='start'",[participantId])).rows[0];if(start)return {id:String(start.id)};
      }
      if(kind==='nudge'){
        if(!conversation.active_question||gamePhase(event,event.now.getTime())!=='open')return {id:null};
        const priorNudge=(await client.query("SELECT id FROM wedding_game_chat_turns WHERE participant_id=$1 AND question_id=$2 AND kind='nudge'",[participantId,conversation.active_question])).rows[0];if(priorNudge)return {id:String(priorNudge.id)};
        if(event.now.getTime()-conversation.updated_at.getTime()<30000)return {id:null};
        const lastMessage=(await client.query("SELECT audit FROM wedding_game_chat_turns WHERE participant_id=$1 AND kind='message' ORDER BY id DESC LIMIT 1",[participantId])).rows[0];
        if(lastMessage?.audit?.intent?.intent==='pause')return {id:null};
      }
      const rate=(await client.query(`SELECT count(*) FILTER(WHERE created_at>clock_timestamp()-interval '1 hour')::int AS count,
        count(*) FILTER(WHERE state<>'complete')::int AS pending FROM wedding_game_chat_turns WHERE participant_id=$1`,[participantId])).rows[0];
      if(rate.pending>=3)throw new GameError('CHAT_BUSY','让我先接住前面那句，马上回来～',429,2);
      if(rate.count>=80)throw new GameError('CHAT_RATE_LIMITED','让我们歇一小会儿，稍后继续聊。',429,60);
      const trace=traceContext();
      const row=(await client.query(`INSERT INTO wedding_game_chat_turns(room_id,participant_id,request_id,kind,input,question_id,config_version,trace_id,parent_span_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[this.room,participantId,requestId,kind,input,conversation.active_question,conversation.active_config_version||event.version,trace.trace_id||null,trace.span_id||null])).rows[0];
      return {id:String(row.id)};
    }).then(result=>{log('conversation.accepted',{room:this.room,participant_id:participantId,business_id:requestId,job_id:result.id,job_kind:kind});return result;});
  }
  async claim(){
    return this.game.transaction(async client=>{
      const {rows}=await client.query(`WITH candidate AS (
        SELECT t.id FROM wedding_game_chat_turns t WHERE t.room_id=$1 AND t.available_at<=clock_timestamp()
        AND EXISTS(SELECT 1 FROM wedding_games g WHERE g.room_id=t.room_id AND g.published)
        AND (t.state='pending' OR (t.state='processing' AND t.lease_until<clock_timestamp()))
        AND NOT EXISTS(SELECT 1 FROM wedding_game_chat_turns earlier WHERE earlier.participant_id=t.participant_id AND earlier.id<t.id AND earlier.state<>'complete')
        ORDER BY t.id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE wedding_game_chat_turns t SET state='processing',progress='thinking',attempts=attempts+1,last_attempt_at=clock_timestamp(),lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds'
        FROM candidate c WHERE t.id=c.id RETURNING t.*`,[this.room,randomUUID()]);
      return rows[0]||null;
    });
  }
  async progress(turn,stage){
    const updated=await this.pool.query("UPDATE wedding_game_chat_turns SET progress=$3 WHERE id=$1 AND lease_token=$2 AND state='processing'",[turn.id,turn.lease_token,stage]);
    if(!updated.rowCount)throw new Error('CHAT_SUPERSEDED');
    log('conversation.stage',{stage});
  }
  async defer(turn,waitMs) {
    await this.pool.query("UPDATE wedding_game_chat_turns SET state='pending',progress='thinking',lease_token=NULL,lease_until=NULL,available_at=clock_timestamp()+$3*interval '1 millisecond' WHERE id=$1 AND lease_token=$2 AND state='processing'",[turn.id,turn.lease_token,waitMs]);
    log('conversation.deferred',{wait_ms:waitMs,attempt:turn.attempts},'warn');
  }
  async saveDecision(turn,audit){const updated=await this.pool.query("UPDATE wedding_game_chat_turns SET audit=$3 WHERE id=$1 AND lease_token=$2 AND state='processing'",[turn.id,turn.lease_token,audit]);if(!updated.rowCount)throw new Error('CHAT_SUPERSEDED');}
  async release(turn){await this.pool.query("UPDATE wedding_game_chat_turns SET state='pending',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='processing'",[turn.id,turn.lease_token]);}
  async context(turn){
    const event=await this.game.event(),me=await this.game.participant(turn.participant_id);
    const conversation=(await this.pool.query('SELECT * FROM wedding_game_conversations WHERE participant_id=$1 AND room_id=$2',[turn.participant_id,this.room])).rows[0];
    const recent=(await this.pool.query("SELECT input,reply,audit,question_id FROM wedding_game_chat_turns WHERE participant_id=$1 AND state='complete' ORDER BY id DESC LIMIT 6",[turn.participant_id])).rows.reverse();
    for(const row of recent)row.reply=guestReply(row,me.answers,event.config.questions);
    let offTopicTurns=0;
    for(const row of [...recent].reverse()){
      if(row.question_id!==conversation.active_question||row.audit?.intent?.intent!=='chat')break;
      offTopicTurns++;
    }
    return {event,me,conversation,offTopicTurns,recent:recent.flatMap(row=>[...((row.audit?.safeMessage||row.audit?.intent?.summary)?[{role:'guest',text:row.audit.safeMessage||row.audit.intent.summary}]:[]),...(row.reply?.messages||[]).map(message=>({role:'host',text:message}))])};
  }
  async deck(event,question){
    if(!question)return null;
    const record=(await this.pool.query('SELECT deck FROM wedding_game_question_voice WHERE room_id=$1 AND config_version=$2 AND question_id=$3',[this.room,event.version,question.id])).rows[0];
    return {id:question.id,...(record?.deck||fallbackDeck(question))};
  }
  async finish(turn,reply,audit,activeQuestion,offeredChoices,configVersion){
    return this.game.transaction(async client=>{
      const row=await client.query("UPDATE wedding_game_chat_turns SET state='complete',progress=NULL,reply=$3,audit=$4,completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='processing' RETURNING id",[turn.id,turn.lease_token,reply,audit]);
      if(!row.rowCount)return false;
      await client.query('UPDATE wedding_game_conversations SET active_question=$2,offered_choices=$3,active_config_version=$4,revision=revision+1,updated_at=clock_timestamp() WHERE participant_id=$1',[turn.participant_id,activeQuestion,JSON.stringify(offeredChoices),configVersion]);
      return true;
    });
  }
  async snapshot(participantId){
    const conversation=(await this.pool.query('SELECT * FROM wedding_game_conversations WHERE room_id=$1 AND participant_id=$2',[this.room,participantId])).rows[0];
    const rows=(await this.pool.query('SELECT id,request_id,kind,input,question_id,state,progress,reply,created_at FROM wedding_game_chat_turns WHERE room_id=$1 AND participant_id=$2 ORDER BY id DESC LIMIT 160',[this.room,participantId])).rows.reverse();
    const answers=(await this.game.participant(participantId)).answers;
    const event=await this.game.event();
    return {revision:conversation?.revision||0,activeQuestion:conversation?.active_question||null,turns:rows.map(row=>{
      const reply=guestReply(row,answers,event.config.questions);
      return {id:String(row.id),requestId:row.request_id,kind:row.kind,input:row.input,state:row.state,progress:row.progress,reply,createdAt:row.created_at};
    })};
  }
  async resolveFailure(id,body,actor){
    numericId(id);if(!['correct','incorrect','ignore'].includes(body.decision))throw new GameError('INVALID_INPUT','请选择处理方式');
    const reason=text(body.reason,'处理依据',400);
    const turn=await this.game.transaction(async client=>{
      const event=await this.game.event(client);if(event.settled_at)throw new GameError('SETTLED','已结算记录不能更改',409);
      const row=(await client.query('SELECT * FROM wedding_game_chat_turns WHERE id=$1 AND room_id=$2 FOR UPDATE',[id,this.room])).rows[0];
      if(!row||row.state!=='complete'||!row.reply?.retryable)throw new GameError('NOT_RETRYABLE','这条消息已处理或正在处理中',409);
      const token=randomUUID();await client.query("UPDATE wedding_game_chat_turns SET state='processing',lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=$1",[id,token]);return {...row,lease_token:token};
    });
    try{
      const context=await this.context(turn);let active=context.conversation.active_question,reply={messages:['刚才那句话已经记下，我们接着聊。'],choices:[],quickReplies:[],source:'manual'};
      if(body.decision!=='ignore'){
        if(!turn.question_id)throw new GameError('INVALID_INPUT','这条消息不对应竞猜问题');
        const answer=await this.game.submit(turn.participant_id,{requestId:turn.request_id,questionId:turn.question_id,text:turn.input,configVersion:context.event.version},{receivedAt:turn.created_at,leaseToken:randomUUID()});
        await this.game.manualReview(String(answer.id),{expectedVersion:answer.version,verdict:body.decision,reason},actor);
        const me=await this.game.participant(turn.participant_id),next=context.event.config.questions.find(question=>!me.answers.some(answer=>answer.questionId===question.id));
        active=gamePhase(context.event,context.event.now.getTime())==='open'?next?.id||null:null;
        const deck=active?await this.deck(context.event,next):null;
        reply={...reply,messages:[body.decision==='correct'?'刚才那份默契核对好啦，你答中了！':'刚才那份默契核对好啦，这次没有猜中。',...(deck?[deck.phrasings[0]]:[])],answerId:String(answer.id),answerVersion:answer.version+1,questionText:deck?.phrasings[0]||null,questionId:active};
      }
      await this.finish(turn,reply,{...turn.audit,resolvedBy:actor,decision:body.decision,reason},active,body.decision==='ignore'?context.conversation.offered_choices:[],context.event.version);
      return {ok:true};
    }catch(error){await this.pool.query("UPDATE wedding_game_chat_turns SET state='complete',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",[turn.id,turn.lease_token]);throw error;}
  }
}
