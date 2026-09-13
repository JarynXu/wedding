import { log } from '../observability.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { GameError, phoneNumber, text, uuid } from './model.js';
import { gameTransaction } from './persistence.js';

/** 图形验证与短信核验均由供应商确认；本地负责限额、一次使用与30天会话。 */
export class GameIdentity {
  constructor(pool, room, secrets, sms, runtime, captcha) { Object.assign(this,{pool,room,secrets,sms,runtime,captcha}); }
  async priorRequest(client,id,phoneHash) {
    const prior=(await client.query('SELECT *,clock_timestamp() AS now FROM wedding_game_otps WHERE id=$1 AND room_id=$2',[id,this.room])).rows[0];
    if(!prior)return null;
    if(prior.phone_hash!==phoneHash)throw new GameError('REQUEST_CONFLICT','验证码请求不一致',409);
    if(['failed','used'].includes(prior.state)||prior.expires_at<=prior.now)throw new GameError('CODE_UNAVAILABLE','该验证码请求已失效，请重新获取',409);
    return {challengeId:id,delivery:prior.state==='sent'?'sent':'unknown',expiresAt:prior.expires_at,retryAfter:60};
  }
  async checkRate(client,phoneHash,networkHash) {
    const event=(await client.query('SELECT published FROM wedding_games WHERE room_id=$1',[this.room])).rows[0];
    if(!event?.published)throw new GameError('NOT_OPEN','默契挑战尚未开放',409);
    const rate=(await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE phone_hash=$2 AND created_at>clock_timestamp()-interval '1 hour')::int AS phone_count,
      count(*) FILTER(WHERE network_hash=$3 AND created_at>clock_timestamp()-interval '1 hour')::int AS network_count,
      extract(epoch FROM (clock_timestamp()-max(created_at) FILTER(WHERE phone_hash=$2))) AS since_last
      FROM wedding_game_otps WHERE room_id=$1 AND created_at>clock_timestamp()-interval '24 hours'`,[this.room,phoneHash,networkHash])).rows[0];
    if(rate.total>=this.runtime.dailyLimit||rate.phone_count>=5||rate.network_count>=(this.runtime.networkHourlyLimit||500)||(rate.since_last!=null&&Number(rate.since_last)<60))throw new GameError('SMS_RATE_LIMITED','验证码发送频繁，请稍后再试',429,60);
  }
  async requestCode(body,network) {
    if(!this.sms.configured)throw new GameError('SMS_UNAVAILABLE','验证码服务尚未开放',503);
    if(!this.captcha?.configured)throw new GameError('CAPTCHA_UNAVAILABLE','图形验证服务尚未开放',503);
    const phone=phoneNumber(body.phone),id=uuid(body.requestId),phoneHash=this.secrets.digest('phone',phone),networkHash=this.secrets.digest('network',network);
    log('sms.requested',{room:this.room,business_id:id});
    const prior=await this.priorRequest(this.pool,id,phoneHash);if(prior)return prior;
    await this.checkRate(this.pool,phoneHash,networkHash);
    const lot=await this.captcha.verify(body.captcha);
    const reservation=await gameTransaction(this.pool,this.room,async client=>{
      const prior=await this.priorRequest(client,id,phoneHash);if(prior)return {prior};
      await this.checkRate(client,phoneHash,networkHash);
      const used=await client.query('INSERT INTO wedding_game_captcha_uses(lot_number,room_id,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING lot_number',[lot,this.room,id]);
      if(used.rowCount!==1)throw new GameError('CAPTCHA_REPLAY','这次图形验证已使用，请重新验证',409);
      const row=(await client.query(`INSERT INTO wedding_game_otps(id,room_id,phone_hash,network_hash,state,expires_at)
        VALUES($1,$2,$3,$4,'queued',clock_timestamp()+interval '5 minutes') RETURNING expires_at`,[id,this.room,phoneHash,networkHash])).rows[0];
      return {expiresAt:row.expires_at};
    });
    if(reservation.prior)return reservation.prior;
    const result=await this.sms.send(phone,id);
    const updated=await this.pool.query("UPDATE wedding_game_otps SET state=$2,provider_biz_id=$3 WHERE id=$1 AND state='queued' RETURNING expires_at",[id,result.delivery,result.bizId||null]);
    log('sms.delivery',{room:this.room,business_id:id,status:result.delivery});
    if(result.delivery==='failed')throw new GameError('SMS_FAILED','验证码未能发送，请稍后重试',503);
    return {challengeId:id,delivery:result.delivery,expiresAt:updated.rows[0]?.expires_at||reservation.expiresAt,retryAfter:60};
  }
  async verifyCode(body) {
    const phone=phoneNumber(body.phone),challenge=uuid(body.challengeId),name=text(body.name,'称呼',24);
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new GameError('INVALID_CODE','请填写六位短信验证码');
    const phoneHash=this.secrets.digest('phone',phone),lease=randomUUID();
    await gameTransaction(this.pool,this.room,async client=>{
      const otp=(await client.query('SELECT *,clock_timestamp() AS now FROM wedding_game_otps WHERE id=$1 AND room_id=$2 AND phone_hash=$3 FOR UPDATE',[challenge,this.room,phoneHash])).rows[0];
      if(!otp||['failed','used'].includes(otp.state)||otp.expires_at<=otp.now||otp.attempts>=5)throw new GameError('INVALID_CODE','验证码无效或已过期，请重新获取');
      if(otp.verify_until&&otp.verify_until>otp.now)throw new GameError('VERIFY_BUSY','验证码正在核验，请稍后重试',409);
      await client.query("UPDATE wedding_game_otps SET attempts=attempts+1,verify_token=$2,verify_until=clock_timestamp()+interval '25 seconds' WHERE id=$1",[challenge,lease]);
    });
    const verified=await this.sms.verify(phone,body.code,challenge);
    log('sms.verified',{room:this.room,business_id:challenge,verdict:verified});
    const result=await gameTransaction(this.pool,this.room,async client=>{
      const otp=(await client.query('SELECT *,clock_timestamp() AS now FROM wedding_game_otps WHERE id=$1 AND room_id=$2 AND phone_hash=$3 FOR UPDATE',[challenge,this.room,phoneHash])).rows[0];
      if(!otp||otp.verify_token!==lease||otp.state==='used'||otp.expires_at<=otp.now)return {error:'验证码已失效，请重新获取'};
      await client.query('UPDATE wedding_game_otps SET verify_token=NULL,verify_until=NULL WHERE id=$1',[challenge]);
      if(verified!=='pass')return verified==='fail'?{error:'验证码不正确，请检查后重试'}:{unavailable:true};
      const participant=(await client.query(`INSERT INTO wedding_game_participants(id,room_id,phone_hash,phone_cipher,phone_last4,name)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(room_id,phone_hash) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[randomUUID(),this.room,phoneHash,this.secrets.seal('phone',phone),phone.slice(-4),name])).rows[0];
      await client.query("UPDATE wedding_game_otps SET state='used' WHERE id=$1",[challenge]);
      const token=randomBytes(32).toString('base64url');
      await client.query("INSERT INTO wedding_game_sessions(token_hash,participant_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '30 days')",[this.secrets.digest('session',token),participant.id]);
      await client.query('DELETE FROM wedding_game_sessions WHERE expires_at<clock_timestamp()');
      return {token,participantId:participant.id};
    });
    if(result.unavailable)throw new GameError('VERIFY_UNAVAILABLE','验证码暂时无法核验，请稍后重试',503);
    if(result.error)throw new GameError('INVALID_CODE',result.error);
    return result;
  }
  async session(cookie) {
    const token=readGameCookie(cookie);if(!token)return null;
    const {rows}=await this.pool.query(`SELECT s.participant_id FROM wedding_game_sessions s JOIN wedding_game_participants p ON p.id=s.participant_id
      WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND p.room_id=$2`,[this.secrets.digest('session',token),this.room]);
    return rows[0]?.participant_id||null;
  }
  async logout(cookie) {
    const token=readGameCookie(cookie);if(token)await this.pool.query('DELETE FROM wedding_game_sessions WHERE token_hash=$1',[this.secrets.digest('session',token)]);
  }
}
function readGameCookie(header=''){const token=header.split(';').map(part=>part.trim()).find(part=>part.startsWith('wedding_game='))?.slice(13);return token&&/^[\w-]{43}$/.test(token)?token:null;}
