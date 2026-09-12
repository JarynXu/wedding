import pg from 'pg';
import { randomBytes,randomUUID,randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { GameStore } from '../server/game/store.js';
import { GameSecrets } from '../server/game/secrets.js';
import { GameIdentity } from '../server/game/identity.js';
import { readAdminConfig } from '../server/admin/config.js';
import { hashPassword } from '../server/admin/password.js';
import { createInvitationApp } from '../server/app.js';
import { WEDDING_CONFIG } from '../src/config.js';
export const gameTestDatabase=process.env.BLESSINGS_TEST_DATABASE_URL;
export async function gameFixture() {
  const pool=new pg.Pool({connectionString:gameTestDatabase,ssl:false,max:5});
  await pool.query(await readFile(new URL('../server/game/schema.sql',import.meta.url),'utf8'));
  const room='game-test-'+randomUUID(),runtime={dataKey:randomBytes(32),sessionSecret:randomBytes(32).toString('hex'),dailyLimit:300,cookieSecure:false,captcha:{appId:'isolated-test-captcha'}};
  const codes=new Map();
  const sms={configured:true,calls:[],async send(phone,requestId){const code=String(randomInt(1000000)).padStart(6,'0');this.calls.push({phone,requestId});codes.set(phone,code);return {delivery:'sent'};},async verify(phone,code){return codes.get(phone)===code?'pass':'fail';}};
  const proof=()=>({lot_number:randomUUID().replaceAll('-',''),captcha_output:'test',pass_token:'test',gen_time:String(Math.floor(Date.now()/1000)),testPassed:true});
  const captcha={configured:true,async verify(value){if(!value?.testPassed)throw new Error('isolated captcha rejected');return value.lot_number;}};
  const secrets=new GameSecrets(runtime),store=new GameStore(pool,room,secrets),identity=new GameIdentity(pool,room,secrets,sms,runtime,captcha);
  await store.initialize();
  const integrations={sms:{configured:true},captcha:{configured:true},ai:{configured:true}};
  const config=(await store.event()).config;
  config.closesAt=new Date(Date.now()+3600000).toISOString();
  config.questions.forEach((q,i)=>{q.title=`隔离测试题 ${i+1}`;q.answer=`测试答案 ${i+1}`;});
  await store.saveConfig({expectedVersion:1,config},'test-admin');
  await store.publish(2,integrations);
  const service={store,identity,runtime,integrations,ensure:async()=>{},tick:()=>{}};
  const servers=[];
  async function server() {
    let handler;const node=createServer((req,res)=>handler(req,res));node.listen(0,'127.0.0.1');await new Promise(resolve=>node.once('listening',resolve));
    const origin='http://127.0.0.1:'+node.address().port;
    const admin=readAdminConfig({ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD_HASH:await hashPassword('test-admin-password'),ADMIN_SESSION_SECRET:runtime.sessionSecret,ADMIN_COOKIE_SECURE:'false'});
    servers.push(node);
    handler=createInvitationApp({game:service,admin,gameOrigin:origin});
    return origin;
  }
  async function participant(index=0) {
    const phone='+86'+(13000000000+index),name='测试来宾'+index;
    const code=await identity.requestCode({phone,requestId:randomUUID(),captcha:proof()},'test-network');
    return {...await identity.verifyCode({phone,name,challengeId:code.challengeId,code:codes.get(phone)}),phone,name};
  }
  return {pool,room,runtime,codes,sms,captcha,proof,secrets,store,identity,service,integrations,server,participant,
    async close(){
      for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      await pool.query('DELETE FROM wedding_game_sessions WHERE participant_id IN (SELECT id FROM wedding_game_participants WHERE room_id=$1)',[room]);
      await pool.query('DELETE FROM wedding_game_reviews WHERE answer_id IN (SELECT id FROM wedding_game_answers WHERE room_id=$1)',[room]);
      for(const table of ['wedding_game_answers','wedding_game_prizes','wedding_game_otps','wedding_game_captcha_uses','wedding_game_participants','wedding_game_config_history','wedding_games'])await pool.query(`DELETE FROM ${table} WHERE room_id=$1`,[room]);
      await pool.end();
    }};
}
export async function gameRequest(origin,path,body,cookie,method) {
  return fetch(origin+path,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
export async function adminLogin(origin){const response=await gameRequest(origin,'/admin/api/login',{username:'test-admin',password:'test-admin-password'});if(!response.ok)throw Error('admin login failed');return response.headers.get('set-cookie').split(';')[0];}
