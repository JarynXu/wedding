import pg from 'pg';
import { createHmac } from 'node:crypto';
import { BlessingError, publicBlessing } from './model.js';

/** PostgreSQL 是历史与重放的唯一来源，通知只负责唤醒读取。 */
export class BlessingStore {
  constructor(config) {
    this.config = config;
    this.pool = new pg.Pool(config.database);
    this.pool.on('error', error => console.error('祝福数据库连接中断', error.code || error.name));
  }
  async verify() { await this.pool.query('SELECT id, request_id, fingerprint, gift_count FROM wedding_blessings LIMIT 0'); }
  async latestId() { const { rows } = await this.pool.query('SELECT id FROM wedding_blessings WHERE room_id=$1 ORDER BY id DESC LIMIT 1', [this.config.room]); return rows[0]?.id || '0'; }
  async dashboardStats() {
    const { rows } = await this.pool.query('SELECT count(*)::text AS total_count, max(created_at) AS last_saved_at FROM wedding_blessings WHERE room_id=$1', [this.config.room]);
    return { totalCount: rows[0]?.total_count || '0', lastSavedAt: rows[0]?.last_saved_at || null };
  }
  async history(before = null, limit = 30) {
    const { rows } = await this.pool.query('SELECT * FROM wedding_blessings WHERE room_id=$1 AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT $3', [this.config.room, before, limit + 1]);
    const messages = rows.slice(0, limit).map(publicBlessing);
    return { messages, hasMore: rows.length > limit, next: messages.at(-1)?.id || null };
  }
  async since(after, limit = 200) {
    const { rows } = await this.pool.query('SELECT * FROM wedding_blessings WHERE room_id=$1 AND id>$2 ORDER BY id ASC LIMIT $3', [this.config.room, after, limit]);
    return rows.map(publicBlessing);
  }
  async save(message, network) {
    const client = await this.pool.connect();
    const hash = value => createHmac('sha256', this.config.secret).update(value).digest('hex');
    const senderHash = hash(`sender:${message.clientId}`);
    const networkHash = hash(`network:${network}`);
    let releaseError;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '4s'");
      // 同一请柬先取得锁再分配序号，保证游标顺序与提交顺序一致。
      await client.query('SELECT pg_advisory_xact_lock(1279440461, hashtext($1))', [this.config.room]);
      const prior = await client.query('SELECT * FROM wedding_blessings WHERE room_id=$1 AND request_id=$2', [this.config.room, message.requestId]);
      if (prior.rows.length) {
        if (prior.rows[0].fingerprint !== message.fingerprint || prior.rows[0].sender_hash !== senderHash) throw new BlessingError('REQUEST_CONFLICT', '这次发送的内容已改变，请重新发送', 409);
        await client.query('COMMIT');
        return { message: publicBlessing(prior.rows[0]), created: false };
      }
      const rate = await client.query(`SELECT count(*) FILTER (WHERE sender_hash=$2)::int AS sender_count,
        count(*) FILTER (WHERE network_hash=$3)::int AS network_count,
        extract(epoch FROM (clock_timestamp()-max(created_at) FILTER (WHERE sender_hash=$2)))*1000 AS elapsed_ms
        FROM wedding_blessings WHERE room_id=$1 AND created_at>clock_timestamp()-interval '1 minute'
        AND (sender_hash=$2 OR network_hash=$3)`, [this.config.room, senderHash, networkHash]);
      const row = rate.rows[0];
      const elapsed = row.elapsed_ms == null ? Infinity : Number(row.elapsed_ms);
      if (row.sender_count >= this.config.clientLimit || row.network_count >= this.config.networkLimit || elapsed < this.config.minIntervalMs) {
        const wait = elapsed < this.config.minIntervalMs ? Math.ceil((this.config.minIntervalMs - elapsed) / 1000) : 60;
        throw new BlessingError('RATE_LIMITED', '发送有些频繁，稍等片刻再试', 429, Math.max(1, wait));
      }
      const inserted = await client.query(`INSERT INTO wedding_blessings
        (room_id,request_id,fingerprint,sender_hash,network_hash,guest_name,message,gift_id,sender_theme,gift_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [this.config.room, message.requestId, message.fingerprint, senderHash, networkHash, message.name, message.text, message.gift, message.theme, message.giftCount || 1]);
      await client.query("SELECT pg_notify('wedding_blessings_changed', $1)", [this.config.room]);
      await client.query('COMMIT');
      return { message: publicBlessing(inserted.rows[0]), created: true };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
      throw error;
    } finally { client.release(releaseError); }
  }
  async close() { await this.pool.end(); }
  async beginWriting(message,network) {
    const hash=value=>createHmac('sha256',this.config.secret).update(value).digest('hex');
    const sender=hash(`sender:${message.clientId}`),source=hash(`network:${network}`),client=await this.pool.connect();
    let releaseError;
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='4s'");
      await client.query('SELECT pg_advisory_xact_lock(1279440461,hashtext($1))',[this.config.room+':writing']);
      const prior=(await client.query('SELECT * FROM wedding_blessing_writing WHERE room_id=$1 AND request_id=$2',[this.config.room,message.requestId])).rows[0];
      if(prior){
        if(prior.sender_hash!==sender||prior.fingerprint!==message.fingerprint)throw new BlessingError('REQUEST_CONFLICT','本次润色内容已改变',409);
        if(prior.state!=='complete')throw new BlessingError('WRITING_UNAVAILABLE','上次润色尚未取得结果，请稍后重试',429,15);
        await client.query('COMMIT');return {result:prior.result};
      }
      const rate=(await client.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE sender_hash=$2)::int AS sender,count(*) FILTER(WHERE network_hash=$3)::int AS network
        FROM wedding_blessing_writing WHERE room_id=$1 AND created_at>clock_timestamp()-interval '1 minute'`,[this.config.room,sender,source])).rows[0];
      if(rate.total>=120||rate.sender>=6||rate.network>=60)throw new BlessingError('WRITING_RATE_LIMITED','先留一份心意吧，过一会儿再试试AI润色。',429,60);
      await client.query('DELETE FROM wedding_blessing_writing WHERE room_id=$1 AND created_at<clock_timestamp()-interval \'30 minutes\'',[this.config.room]);
      await client.query('INSERT INTO wedding_blessing_writing(room_id,request_id,sender_hash,network_hash,fingerprint) VALUES($1,$2,$3,$4,$5)',[this.config.room,message.requestId,sender,source,message.fingerprint]);
      await client.query('COMMIT');return {result:null};
    }catch(error){try{await client.query('ROLLBACK');}catch(failure){releaseError=failure;}throw error;}finally{client.release(releaseError);}
  }
  async finishWriting(requestId,result) { await this.pool.query("UPDATE wedding_blessing_writing SET result=$3,state=$4 WHERE room_id=$1 AND request_id=$2 AND state='pending'",[this.config.room,requestId,result,result?'complete':'failed']); }
}
