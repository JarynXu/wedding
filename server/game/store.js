import { roomState } from '../room-operations.js';
import { traceContext, log } from '../observability.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { GameError, gamePhase, initialGameConfig, rankGame, text, uuid, validateGameConfig } from './model.js';
import { gameTransaction } from './persistence.js';
import { answerReply, questionGreeting } from '../../src/game-voice.js';

export class GameStore {
  constructor(pool, room, secrets) { this.pool = pool; this.room = room; this.secrets = secrets; this.initialized = false; }
  async initialize() {
    await this.pool.query('INSERT INTO wedding_games(room_id,config) VALUES($1,$2) ON CONFLICT DO NOTHING', [this.room, initialGameConfig()]);
    await this.prepareQuestionVoice(this.pool);
    this.initialized = true;
  }
  async event(client = this.pool) {
    const { rows } = await client.query('SELECT *,clock_timestamp() AS now FROM wedding_games WHERE room_id=$1', [this.room]);
    if (!rows.length) throw new GameError('GAME_UNAVAILABLE', '游戏正在准备中', 503);
    const event=rows[0];
    event.config.participationLimit ??= event.config.maxWinners;
    delete event.config.maxWinners;
    return event;
  }
  transaction(operation) { return gameTransaction(this.pool, this.room, operation); }
  async prepareQuestionVoice(client) {
    await client.query(`INSERT INTO wedding_game_question_voice(room_id,config_version,question_id,title,position)
      SELECT g.room_id,g.version,q.value->>'id',q.value->>'title',(q.ordinality-1)::int
      FROM wedding_games g CROSS JOIN LATERAL jsonb_array_elements(g.config->'questions') WITH ORDINALITY q
      WHERE g.room_id=$1 AND g.published ON CONFLICT DO NOTHING`, [this.room]);
  }
  async publicQuestions(event) {
    const rows = (await this.pool.query('SELECT question_id,result FROM wedding_game_question_voice WHERE room_id=$1 AND config_version=$2', [this.room,event.version])).rows;
    return event.config.questions.map((question,index) => ({ id: question.id, title: question.title, opening: rows.find(row=>row.question_id===question.id)?.result?.message || questionGreeting(index) }));
  }
  async claimQuestionVoice() {
    return this.transaction(async client=>{
    const { rows } = await client.query(`WITH candidate AS (
      SELECT v.room_id,v.config_version,v.question_id FROM wedding_game_question_voice v JOIN wedding_games g ON g.room_id=v.room_id
      WHERE v.room_id=$1 AND v.config_version=g.version AND g.published AND v.deck IS NULL AND (v.lease_until IS NULL OR v.lease_until<clock_timestamp())
      ORDER BY v.position FOR UPDATE OF v SKIP LOCKED LIMIT 1)
      UPDATE wedding_game_question_voice v SET lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds'
      FROM candidate c WHERE v.room_id=c.room_id AND v.config_version=c.config_version AND v.question_id=c.question_id RETURNING v.*`, [this.room,randomUUID()]);
    return rows[0] || null;
    });
  }
  async finishQuestionVoice(job,result) {
    await this.pool.query('UPDATE wedding_game_question_voice SET result=$5,deck=$6,lease_until=NULL,lease_token=NULL WHERE room_id=$1 AND config_version=$2 AND question_id=$3 AND lease_token=$4', [this.room,job.config_version,job.question_id,job.lease_token,{message:result.phrasings[0],source:result.source},result]);
  }
  async ranking(client = this.pool, event) {
    const participants = await client.query('SELECT id,name,phone_last4,created_at FROM wedding_game_participants WHERE room_id=$1', [this.room]);
    const answers = await client.query('SELECT id,participant_id,status,received_at FROM wedding_game_answers WHERE room_id=$1', [this.room]);
    const current=event || await this.event(client),ranking=rankGame(participants.rows,answers.rows,current.config);
    if(current.settled_at){
      const issued=(await client.query('SELECT slot,participant_id,rank,name FROM wedding_game_prizes WHERE room_id=$1 ORDER BY slot',[this.room])).rows;
      ranking.candidates=issued.map(prize=>({...ranking.standings.find(person=>person.id===prize.participant_id),slot:prize.slot,rank:prize.rank,prize:prize.name,award:prize.slot<=3?'podium':'participation'}));
    }
    return ranking;
  }
  async overview(integrations) {
    const event = await this.event(), ranking = await this.ranking(this.pool, event);
    const { rows } = await this.pool.query(`SELECT
      (SELECT count(*)::int FROM wedding_game_answers WHERE room_id=$1 AND status IN ('pending','judging')) AS pending,
      (SELECT count(*)::int FROM wedding_game_answers WHERE room_id=$1 AND status='review') AS review,
      (SELECT count(*)::int FROM wedding_game_prizes WHERE room_id=$1) AS awarded,
      (SELECT count(*)::int FROM wedding_game_prizes WHERE room_id=$1 AND redeemed_at IS NOT NULL) AS redeemed`, [this.room]);
    return { config: { ...event.config, version: event.version }, phase: gamePhase(event, event.now.getTime()), integrations, stats: { ...rows[0], participants: ranking.standings.length, qualified: ranking.standings.filter(row => row.qualifiedAt).length } };
  }
  async saveConfig(body, actor) {
    const config = validateGameConfig(body.config);
    return this.transaction(async client => {
      const event = await this.event(client); checkVersion(event.version, body.expectedVersion);
      if (event.settled_at) throw new GameError('SETTLED', '活动已结算，奖项与规则已锁定', 409);
      if (event.published && config.closesAt !== event.config.closesAt && Date.parse(config.closesAt) <= event.now.getTime()) throw new GameError('INVALID_DEADLINE', '进行中的活动请将新截止时间设在未来');
      if (event.published) checkQuestions(config);
      await client.query('INSERT INTO wedding_game_config_history(room_id,version,config,actor) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [this.room, event.version, event.config, actor]);
      for (const question of config.questions) {
        const prior = event.config.questions.find(item => item.id === question.id);
        if (!sameQuestion(prior, question) || event.config.judgeInstructions !== config.judgeInstructions) {
          await client.query(`UPDATE wedding_game_answers SET question=$3,instructions=$4,status='pending',version=version+1,
            judge_result=NULL,review_result=NULL,host_result=NULL,processing_stage=NULL,reason='题目规则已更新，等待复核',lease_token=NULL,lease_until=NULL WHERE room_id=$1 AND question_id=$2`, [this.room, question.id, question, config.judgeInstructions]);
        }
      }
      await client.query('UPDATE wedding_games SET config=$2,version=version+1 WHERE room_id=$1', [this.room, config]);
      if (event.published) await this.prepareQuestionVoice(client);
    });
  }
  async publish(expectedVersion, integrations) {
    return this.transaction(async client => {
      if((await roomState(client,this.room)).paused)throw new GameError('INTERACTION_PAUSED','请先结束业务清理，再开放活动',409);
      const event = await this.event(client); checkVersion(event.version, expectedVersion);
      if (event.settled_at) throw new GameError('SETTLED', '活动已结算', 409);
      checkQuestions(event.config);
      if (!integrations.sms.configured || !integrations.captcha?.configured || !integrations.ai.configured) throw new GameError('NOT_CONFIGURED', '请先配置短信、图形认证与 AI 判题接口');
      if (Date.parse(event.config.closesAt) <= event.now.getTime()) throw new GameError('CLOSED', '截止时间已过，请修改时间后开放');
      await client.query('UPDATE wedding_games SET published=true WHERE room_id=$1', [this.room]);
      await this.prepareQuestionVoice(client);
    });
  }
  async submit(participantId, body, { receivedAt=null, leaseToken=null } = {}) {
    const requestId = uuid(body.requestId), answer = text(body.text, '回答', 320);
    return this.transaction(async client => {
      const prior = await client.query('SELECT * FROM wedding_game_answers WHERE room_id=$1 AND request_id=$2', [this.room, requestId]);
      if (prior.rows.length) {
        const row = prior.rows[0];
        if (row.participant_id !== participantId || row.text !== answer || row.question_id !== body.questionId) throw new GameError('REQUEST_CONFLICT', '本次提交内容已改变', 409);
        if(leaseToken&&['pending','judging'].includes(row.status)){
          return (await client.query("UPDATE wedding_game_answers SET status='judging',lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=$1 RETURNING *",[row.id,leaseToken])).rows[0];
        }
        return leaseToken?row:publicAnswer(row);
      }
      const event = await this.event(client);
      if (gamePhase(event, receivedAt?new Date(receivedAt).getTime():event.now.getTime()) !== 'open') throw new GameError('CLOSED', '这场小竞猜已经收官了，来看看留下的默契吧。', 409);
      checkVersion(event.version, body.configVersion);
      const question = event.config.questions.find(item => item.id === body.questionId);
      if (!question) throw new GameError('INVALID_QUESTION', '题目不存在');
      const exists = await client.query('SELECT id FROM wedding_game_answers WHERE room_id=$1 AND participant_id=$2 AND question_id=$3', [this.room, participantId, question.id]);
      if (exists.rows.length) throw new GameError('ALREADY_ANSWERED', '本题已提交，请查看判题结果', 409);
      const { rows } = await client.query(`INSERT INTO wedding_game_answers(room_id,participant_id,request_id,question_id,question,instructions,text,received_at,status,lease_token,lease_until,processing_stage,trace_id,parent_span_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10::uuid IS NULL THEN NULL ELSE clock_timestamp()+interval '90 seconds' END,$11,$12,$13) RETURNING *`, [this.room, participantId, requestId, question.id, question, event.config.judgeInstructions, answer, receivedAt||event.now,leaseToken?'judging':'pending',leaseToken,leaseToken?'thinking':null,traceContext().trace_id||null,traceContext().span_id||null]);
      return leaseToken?rows[0]:publicAnswer(rows[0]);
    });
  }
  async claimJob() {
    const token = randomUUID();
    return this.transaction(async client=>{
    const { rows } = await client.query(`WITH candidate AS (
      SELECT a.id FROM wedding_game_answers a JOIN wedding_games g ON g.room_id=a.room_id
      WHERE a.room_id=$1 AND g.published AND g.settled_at IS NULL AND (a.status='pending' OR (a.status='judging' AND a.lease_until<clock_timestamp()))
      AND NOT EXISTS(SELECT 1 FROM wedding_game_chat_turns t WHERE t.participant_id=a.participant_id AND t.request_id=a.request_id AND (t.state<>'complete' OR t.reply->>'retryable'='true'))
      ORDER BY a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1)
      UPDATE wedding_game_answers a SET status='judging',processing_stage='thinking',lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds'
      FROM candidate c WHERE a.id=c.id RETURNING a.*`, [this.room, token]);
    return rows[0] || null;
    });
  }
  async updateJobStage(job,stage) {
    if (!['thinking','checking','replying'].includes(stage)) throw new Error('INVALID_GAME_STAGE');
    const result = await this.pool.query("UPDATE wedding_game_answers SET processing_stage=$5 WHERE room_id=$1 AND id=$2 AND version=$3 AND lease_token=$4 AND status='judging'", [this.room,job.id,job.version,job.lease_token,stage]);
    if (!result.rowCount) throw new Error('GAME_JOB_SUPERSEDED');
  }
  async releaseJob(job) { await this.pool.query("UPDATE wedding_game_answers SET status='pending',lease_token=NULL,lease_until=NULL WHERE room_id=$1 AND id=$2 AND version=$3 AND lease_token=$4 AND status='judging'",[this.room,job.id,job.version,job.lease_token]); }
  async finishJob(job, result) {
    return this.transaction(async client => {
      const event = await this.event(client); if (event.settled_at) return false;
      const { rows } = await client.query(`UPDATE wedding_game_answers SET status=$5,reason=$6,judge_result=$7,review_result=$8,host_result=$9,processing_stage=NULL,lease_token=NULL,lease_until=NULL
        WHERE room_id=$1 AND id=$2 AND version=$3 AND lease_token=$4 AND status='judging' RETURNING id`, [this.room, job.id, job.version, job.lease_token, result.status, result.reason, result.judge, result.reviewer, result.host || null]);
      if (!rows.length) return false;
      await client.query('INSERT INTO wedding_game_reviews(answer_id,version,actor,result) VALUES($1,$2,$3,$4)', [job.id, job.version, 'ai', result]);
      return true;
    }).then(saved=>{log('answer.finished',{room:this.room,participant_id:job.participant_id,job_id:String(job.id),version:job.version,status:saved?result.status:'superseded'});return saved;});
  }
  async manualReview(id, body, actor) {
    if (!['correct', 'incorrect'].includes(body.verdict)) throw new GameError('INVALID_VERDICT', '请选择正确或错误');
    const reason = text(body.reason, '复核依据', 400);
    return this.transaction(async client => {
      const event = await this.event(client); if (event.settled_at) throw new GameError('SETTLED', '已结算答卷不能更改', 409);
      const answer = (await client.query('SELECT * FROM wedding_game_answers WHERE room_id=$1 AND id=$2 FOR UPDATE', [this.room, numericId(id)])).rows[0];
      if (!answer) throw new GameError('NOT_FOUND', '答卷不存在', 404);
      checkVersion(answer.version, body.expectedVersion);
      await client.query('INSERT INTO wedding_game_reviews(answer_id,version,actor,result) VALUES($1,$2,$3,$4)', [id, answer.version, actor, { verdict: body.verdict, reason }]);
      await client.query('UPDATE wedding_game_answers SET status=$3,reason=$4,version=version+1,host_result=NULL,processing_stage=NULL,lease_token=NULL,lease_until=NULL WHERE room_id=$1 AND id=$2', [this.room, id, body.verdict, reason]);
    });
  }
  async participants(before) {
    const event = await this.event(), { standings } = await this.ranking(this.pool, event);
    const all = standings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id.localeCompare(a.id));
    const offset = before ? all.findIndex(row => row.id === uuid(before)) + 1 : 0;
    if (before && offset === 0) throw new GameError('INVALID_CURSOR', '列表位置已变化，请刷新');
    const ordered = all.slice(offset);
    const prizes = (await this.pool.query('SELECT participant_id,name,redeemed_at FROM wedding_game_prizes WHERE room_id=$1', [this.room])).rows;
    return { participants: ordered.slice(0, 30).map(row => participantDto(row, prizes.find(prize => prize.participant_id === row.id))), next: ordered[29]?.id || null, hasMore: ordered.length > 30 };
  }
  async participant(id, includePrivate = false) {
    uuid(id);
    const row = (await this.pool.query('SELECT id,name,phone_last4,created_at FROM wedding_game_participants WHERE room_id=$1 AND id=$2',[this.room,id])).rows[0];
    if (!row) throw new GameError('NOT_FOUND', '参赛记录不存在', 404);
    const prize = (await this.pool.query('SELECT * FROM wedding_game_prizes WHERE room_id=$1 AND participant_id=$2', [this.room, id])).rows[0];
    const answers = (await this.pool.query('SELECT * FROM wedding_game_answers WHERE room_id=$1 AND participant_id=$2 ORDER BY id', [this.room, id])).rows;
    const ranking=await this.ranking();
    const standing=ranking.standings.find(person=>person.id===id);
    const candidate=ranking.candidates.find(person=>person.id===id);
    const history=includePrivate?(await this.pool.query('SELECT r.* FROM wedding_game_reviews r JOIN wedding_game_answers a ON a.id=r.answer_id WHERE a.room_id=$1 AND a.participant_id=$2 ORDER BY r.id',[this.room,id])).rows:[];
    const conversation=includePrivate?(await this.pool.query('SELECT id,input,reply,audit,state,created_at FROM wedding_game_chat_turns WHERE room_id=$1 AND participant_id=$2 ORDER BY id',[this.room,id])).rows:undefined;
    return { participant: participantDto(standing, prize), potentialPrize:candidate?{name:candidate.prize,kind:prizeKind(candidate.slot),awarded:Boolean(prize)}:null, answers: answers.map(answer => includePrivate ? { ...publicAnswer(answer), reason: answer.reason, questionTitle: answer.question.title,
      evaluations:[['判题',answer.judge_result],['复核',answer.review_result],['回应',answer.host_result?{...answer.host_result,model:answer.host_result.model||'预设文案',verdict:answer.host_result.outcome,reason:answer.host_result.message}:null]].filter(([,result])=>result).map(([stage,result])=>({stage,...result})),
      history:history.filter(record=>record.answer_id===answer.id).map(record=>({actor:record.actor,createdAt:record.created_at,result:record.result}))
    } : publicAnswer(answer)),
      ...(includePrivate?{conversation}:{}),...(prize && !includePrivate ? { claim: { code: this.secrets.open('prize', prize.code_cipher), prize: prize.name, redeemedAt: prize.redeemed_at } } : {}) };
  }
  async settlementPreview(client = this.pool, event) {
    if (client === this.pool) return this.transaction(connection => this.settlementPreview(connection));
    event ||= await this.event(client);
    const { candidates } = await this.ranking(client, event);
    const unresolved = (await client.query(`SELECT ((SELECT count(*) FROM wedding_game_answers WHERE room_id=$1 AND status IN ('pending','judging','review'))+
      (SELECT count(*) FROM wedding_game_chat_turns WHERE room_id=$1 AND (state<>'complete' OR reply->>'retryable'='true') AND kind='message' AND question_id IS NOT NULL AND created_at<$2::timestamptz))::int AS count`, [this.room,event.config.closesAt])).rows[0].count;
    const phase = gamePhase(event, event.now.getTime());
    const ballot = (await client.query('SELECT id,version,status FROM wedding_game_answers WHERE room_id=$1 ORDER BY id', [this.room])).rows;
    const proposed = candidates.map(row => ({ participantId: row.id, name: row.name, phoneMasked: '*******' + row.phone_last4, score: row.score, qualificationOrder: row.qualificationOrder, rank: row.rank, slot: row.slot, award: row.award, prize: row.prize }));
    const previewToken = this.secrets.digest('settlement', JSON.stringify({ version: event.version, ballot, proposed }));
    return { ready: phase === 'closed' && unresolved === 0, reason: phase === 'settled' ? '活动已结算' : phase !== 'closed' ? '请在截止后结算' : unresolved ? `还有 ${unresolved} 项互动待处理` : '请核对候选答卷与奖项后确认结算', configVersion: event.version, previewToken, candidates: proposed };
  }
  async settle(body, actor) {
    if (body.confirmed !== true) throw new GameError('CONFIRM_REQUIRED', '请核对获奖候选名单后确认');
    return this.transaction(async client => {
      const event = await this.event(client); checkVersion(event.version, body.expectedVersion);
      if (event.settled_at) return { awarded: (await client.query('SELECT count(*)::int AS count FROM wedding_game_prizes WHERE room_id=$1', [this.room])).rows[0].count, alreadySettled: true };
      const preview = await this.settlementPreview(client, event);
      if (!preview.ready) throw new GameError('NOT_READY', preview.reason, 409);
      if (body.previewToken !== preview.previewToken) throw new GameError('PREVIEW_EXPIRED', '名单或复核结果已变化，请重新预览核对后结算', 409);
      for (const candidate of preview.candidates) {
        const code = randomBytes(10).toString('hex').toUpperCase();
        const insertion = await client.query(`INSERT INTO wedding_game_prizes(room_id,slot,participant_id,rank,name,code_hash,code_cipher)
          SELECT $1::varchar,$2::integer,$3::uuid,$8::integer,$4::varchar,$5::char(64),$6::text WHERE (SELECT count(*) FROM wedding_game_prizes WHERE room_id=$1::varchar)<$7::integer`,
        [this.room, candidate.slot, candidate.participantId, candidate.prize, this.secrets.digest('prize', code), this.secrets.seal('prize', code), event.config.participationLimit+3,candidate.rank]);
        if (insertion.rowCount !== 1) throw new GameError('STOCK_CONFLICT', '奖位数量不一致，尚未完成结算', 409);
      }
      await client.query('UPDATE wedding_games SET settled_at=clock_timestamp(),settled_by=$2 WHERE room_id=$1', [this.room,actor||'unknown']);
      return { awarded: preview.candidates.length, alreadySettled: false };
    });
  }
  async redemption(rawCode, actor = null, requestId) {
    const code = text(rawCode, '兑奖码', 32).replace(/[ -]/g, '').toUpperCase();
    if (!/^[A-F0-9]{20}$/.test(code)) throw new GameError('INVALID_CODE', '兑奖码格式有误');
    if (actor) uuid(requestId);
    return this.transaction(async client => {
      const prize = (await client.query(`SELECT p.*,g.name AS guest_name,g.phone_last4 FROM wedding_game_prizes p JOIN wedding_game_participants g ON g.id=p.participant_id
        WHERE p.room_id=$1 AND p.code_hash=$2 FOR UPDATE OF p`, [this.room, this.secrets.digest('prize', code)])).rows[0];
      if (!prize) throw new GameError('NOT_FOUND', '未找到有效兑奖记录', 404);
      const alreadyRedeemed = Boolean(prize.redeemed_at);
      if (actor && !alreadyRedeemed) {
        const update = await client.query('UPDATE wedding_game_prizes SET redeemed_at=clock_timestamp(),redeemed_by=$3,redemption_request=$4 WHERE room_id=$1 AND slot=$2 AND redeemed_at IS NULL RETURNING redeemed_at', [this.room, prize.slot, actor, requestId]);
        prize.redeemed_at = update.rows[0].redeemed_at;
      }
      return { name: prize.guest_name, phoneMasked: '*******' + prize.phone_last4, prize: prize.name, status: prize.redeemed_at ? 'redeemed' : 'issued', redeemedAt: prize.redeemed_at, ...(actor ? { alreadyRedeemed } : {}) };
    });
  }
}
export function publicAnswer(row) { return { id: String(row.id), requestId: row.request_id, questionId: row.question_id, text: row.text, status: row.status, progress: row.processing_stage || null, reply: row.host_result?.outcome === row.status ? row.host_result.message : answerReply(row.status), version: row.version, receivedAt: row.received_at }; }
export const prizeKind=slot=>['large','medium','small'][slot-1]||'keychain';
function participantDto(row, prize) { return { id: row.id, name: row.name, phoneMasked: '*******' + row.phone_last4, score: row.score, rank: row.rank || null, podiumPlace: row.podiumPlace || null, answered: row.answered, qualifiedAt: row.qualifiedAt, prize: prize?.name || null, redeemedAt: prize?.redeemed_at || null }; }
function checkVersion(actual, expected) { if (actual !== expected) throw new GameError('VERSION_CONFLICT', '配置或答卷已更新，请刷新后再操作', 409); }
function checkQuestions(config) { if (config.questions.some(question => !question.title || !question.answer)) throw new GameError('INCOMPLETE_QUESTIONS', '请填写六道题及标准答案'); }
function sameQuestion(left, right) {
  return left && ['id','title','answer','rubric'].every(key => left[key] === right[key]) && JSON.stringify([...left.aliases].sort()) === JSON.stringify([...right.aliases].sort());
}
export function numericId(value) { if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new GameError('INVALID_ID', '记录编号无效'); return value; }
