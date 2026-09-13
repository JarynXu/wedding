import { createHash, createHmac } from 'node:crypto';

/** 登录限流和退出撤销跨实例共享，不依赖负载均衡粘性。 */
export class AdminSecurityStore {
  constructor(pool,config){this.pool=pool;this.config=config;this.account=createHash('sha256').update(config.username).digest('hex');}
  network(value){return createHmac('sha256',this.config.sessionSecret).update(value).digest('hex');}
  async consumeAttempt(value){
    await this.pool.query('DELETE FROM wedding_admin_attempts WHERE expires_at<=clock_timestamp()');
    await this.pool.query('DELETE FROM wedding_admin_revocations WHERE expires_at<=clock_timestamp()');
    const key=this.network(value);
    const result=await this.pool.query(`INSERT INTO wedding_admin_attempts(account_hash,network_hash,count,expires_at) VALUES($1,$2,1,clock_timestamp()+$3*interval '1 second')
      ON CONFLICT(account_hash,network_hash) DO UPDATE SET count=CASE WHEN wedding_admin_attempts.expires_at<=clock_timestamp() THEN 1 ELSE wedding_admin_attempts.count+1 END,
      expires_at=CASE WHEN wedding_admin_attempts.expires_at<=clock_timestamp() THEN excluded.expires_at ELSE wedding_admin_attempts.expires_at END
      WHERE wedding_admin_attempts.expires_at<=clock_timestamp() OR wedding_admin_attempts.count<$4 RETURNING count`,[this.account,key,this.config.loginWindowSeconds,this.config.loginMaxAttempts]);
    if(result.rowCount)return {allowed:true};
    const row=(await this.pool.query('SELECT extract(epoch FROM(expires_at-clock_timestamp())) AS seconds FROM wedding_admin_attempts WHERE account_hash=$1 AND network_hash=$2',[this.account,key])).rows[0];
    return {allowed:false,retryAfter:Math.max(1,Math.ceil(Number(row?.seconds)||1))};
  }
  resetAttempts(value){return this.pool.query('DELETE FROM wedding_admin_attempts WHERE account_hash=$1 AND network_hash=$2',[this.account,this.network(value)]);}
  async revoke(nonce,expiry){await this.pool.query('INSERT INTO wedding_admin_revocations(token_hash,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING',[this.network(nonce),expiry]);}
  async revoked(nonce){return (await this.pool.query('SELECT 1 FROM wedding_admin_revocations WHERE token_hash=$1 AND expires_at>clock_timestamp()',[this.network(nonce)])).rowCount>0;}
}
