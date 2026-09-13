import { createHmac, timingSafeEqual } from 'node:crypto';
import { GameError, uuid } from './game/model.js';
import { log, traceContext } from './observability.js';

export async function roomState(pool,room){
  return (await pool.query('SELECT paused,generation FROM wedding_room_operations WHERE room_id=$1',[room])).rows[0]||{paused:false,generation:0};
}
export async function acceptBlessing(client,room,generation=0){
  const state=await roomState(client,room);
  if(state.paused)throw new GameError('INTERACTION_PAUSED','互动暂歇，稍后再来看看。',503);
  if(generation!==state.generation)throw new GameError('ROOM_RESET','请重新打开请柬，再送出这份心意。',409);
}
const tables={wedding_blessings:'created_at',wedding_blessing_writing:'created_at',wedding_game_participants:'created_at',wedding_game_answers:'received_at',wedding_game_chat_turns:'created_at',wedding_game_otps:'created_at',wedding_game_prizes:'issued_at'};

/** 清空只作用于本场业务记录；配置、管理员安全记录和操作审计保留。 */
export class RoomOperations {
  constructor({pool,room,secret}){Object.assign(this,{pool,room,secret});}
  sign(value){return createHmac('sha256',this.secret).update('room-reset:'+value).digest('hex');}
  async transaction(operation){
    const client=await this.pool.connect();let failed;
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
      // 这些锁的顺序在所有清理与暂停操作中保持一致。
      for(const key of [this.room,this.room+':writing','game:'+this.room])await client.query('SELECT pg_advisory_xact_lock(1279440461,hashtext($1))',[key]);
      await client.query('INSERT INTO wedding_room_operations(room_id) VALUES($1) ON CONFLICT DO NOTHING',[this.room]);
      const result=await operation(client);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(value=>{failed=value;});throw error;}finally{client.release(failed);}
  }
  async pause(paused,actor){
    if(typeof paused!=='boolean')throw new GameError('INVALID_INPUT','请选择暂停或继续');
    return this.transaction(async client=>{
      const state=await roomState(client,this.room);
      if(state.paused===paused)return state;
      if(paused){await client.query('UPDATE wedding_room_operations SET resume_published=coalesce((SELECT published FROM wedding_games WHERE room_id=$1),false),paused=true,updated_at=clock_timestamp() WHERE room_id=$1',[this.room]);await client.query('UPDATE wedding_games SET published=false WHERE room_id=$1',[this.room]);}
      else{await client.query('UPDATE wedding_games SET published=(SELECT resume_published FROM wedding_room_operations WHERE room_id=$1) WHERE room_id=$1',[this.room]);await client.query('UPDATE wedding_room_operations SET paused=false,updated_at=clock_timestamp() WHERE room_id=$1',[this.room]);}
      await this.audit(client,actor,paused?'pause':'resume',{});await client.query("SELECT pg_notify('wedding_blessings_changed',$1)",[this.room]);return roomState(client,this.room);
    });
  }
  async snapshot(client=this.pool){
    const state=await roomState(client,this.room),counts={},fingerprint={};
    for(const [table,time]of Object.entries(tables)){
      const exists=(await client.query('SELECT to_regclass($1) AS name',[table])).rows[0].name;
      if(!exists){counts[table]=0;continue;}
      const row=(await client.query(`SELECT count(*)::int AS count,max(${time})::text AS latest FROM ${table} WHERE room_id=$1`,[this.room])).rows[0];counts[table]=row.count;fingerprint[table]=row;
    }
    fingerprint.answerVersions=(await client.query('SELECT coalesce(sum(version),0)::text AS total FROM wedding_game_answers WHERE room_id=$1',[this.room])).rows[0].total;
    const active=(await client.query(`SELECT (
      (SELECT count(*) FROM wedding_game_chat_turns WHERE room_id=$1 AND state='processing' AND lease_until>clock_timestamp())+
      (SELECT count(*) FROM wedding_game_answers WHERE room_id=$1 AND status='judging' AND lease_until>clock_timestamp())+
      (SELECT count(*) FROM wedding_game_question_voice WHERE room_id=$1 AND lease_until>clock_timestamp())+
      (SELECT count(*) FROM wedding_game_otps WHERE room_id=$1 AND ((state='queued' AND expires_at>clock_timestamp()) OR verify_until>clock_timestamp()))+
      (SELECT count(*) FROM wedding_blessing_writing WHERE room_id=$1 AND state='pending' AND created_at>clock_timestamp()-interval '45 seconds'))::int AS count`,[this.room])).rows[0].count;
    const event=(await client.query('SELECT version FROM wedding_games WHERE room_id=$1',[this.room])).rows[0];
    const token=this.sign(JSON.stringify({generation:state.generation,version:event?.version,counts,fingerprint}));
    return {...state,counts,active,token};
  }
  async reset(body,actor){
    const requestId=uuid(body.requestId);
    if(body.confirmation!=='清空试运行数据')throw new GameError('CONFIRM_REQUIRED','请输入“清空试运行数据”');
    return this.transaction(async client=>{
      const previous=(await client.query("SELECT details FROM wedding_operation_audit WHERE room_id=$1 AND request_id=$2 AND action='reset'",[this.room,requestId])).rows[0]?.details;
      if(previous){if(previous.token!==body.token)throw new GameError('REQUEST_CONFLICT','清理请求的范围已改变，请重新核对',409);return {cleared:true,generation:previous.generation,counts:previous.counts,alreadyCleared:true};}
      const snapshot=await this.snapshot(client);
      if(!snapshot.paused)throw new GameError('NOT_PAUSED','请先暂停互动，再核对清理范围',409);
      if(snapshot.active)throw new GameError('WORK_IN_PROGRESS','仍有互动正在处理，请稍后重新核对',409);
      if(typeof body.token!=='string'||body.token.length!==snapshot.token.length||!timingSafeEqual(Buffer.from(body.token),Buffer.from(snapshot.token)))throw new GameError('PREVIEW_EXPIRED','数据已变化，请重新核对清理范围',409);
      await client.query('DELETE FROM wedding_game_sessions WHERE participant_id IN(SELECT id FROM wedding_game_participants WHERE room_id=$1)',[this.room]);
      await client.query('DELETE FROM wedding_game_reviews WHERE answer_id IN(SELECT id FROM wedding_game_answers WHERE room_id=$1)',[this.room]);
      for(const table of ['wedding_game_chat_turns','wedding_game_conversations','wedding_game_answers','wedding_game_prizes','wedding_game_otps','wedding_game_captcha_uses','wedding_game_participants','wedding_blessing_writing','wedding_blessings'])await client.query(`DELETE FROM ${table} WHERE room_id=$1`,[this.room]);
      const game=(await client.query('UPDATE wedding_games SET published=false,settled_at=NULL,settled_by=NULL,version=version+1 WHERE room_id=$1 RETURNING version',[this.room])).rows[0];
      await client.query(`INSERT INTO wedding_game_question_voice(room_id,config_version,question_id,title,position,result,deck)
        SELECT room_id,$2,question_id,title,position,result,deck FROM wedding_game_question_voice WHERE room_id=$1 AND config_version=$2-1 ON CONFLICT DO NOTHING`,[this.room,game.version]);
      await client.query('UPDATE wedding_room_operations SET generation=generation+1,resume_published=false,updated_at=clock_timestamp() WHERE room_id=$1',[this.room]);
      await client.query("INSERT INTO wedding_operation_audit(room_id,actor,action,trace_id,details,request_id) VALUES($1,$2,'reset',$3,$4,$5)",[this.room,actor,traceContext().trace_id||null,{generation:snapshot.generation+1,counts:snapshot.counts,token:body.token},requestId]);await client.query("SELECT pg_notify('wedding_blessings_changed',$1)",[this.room]);
      return {cleared:true,generation:snapshot.generation+1,counts:snapshot.counts};
    }).then(result=>{log('room.reset',{room:this.room,generation:result.generation,counts:result.counts});return result;});
  }
  audit(client,actor,action,details){return client.query('INSERT INTO wedding_operation_audit(room_id,actor,action,trace_id,details) VALUES($1,$2,$3,$4,$5)',[this.room,actor,action,traceContext().trace_id||null,details]);}
}
