// 显式运行五个 Node 服务进程和100个会话；AI由本机模拟器响应，不发送短信。
import { fork } from 'node:child_process';
import { createServer,request as proxyRequest } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';

if(!process.argv.includes('--run')||new URL(gameTestDatabase).hostname!=='127.0.0.1')throw Error('需要 --run 和本机隔离数据库');
await mkdir('.temp/reports', { recursive: true });
const f=await gameFixture(),children=[],logs=[],ports=[];let active=0,peak=0,modelCalls=0,failures=0,bytes=0,requests=0;
const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),system=body.messages[0].content;
  active++;peak=Math.max(peak,active);modelCalls++;await delay(250);
  let result;
  if(system.includes('入口审查员'))result={intent:'answer',summary:'',reason:'isolated simulator',choiceIndex:null};
  else if(system.includes('阅卷员'))result={verdict:'correct',reason:'isolated simulator',evidence:JSON.parse(body.messages.at(-1).content).untrustedAnswer};
  else if(system.includes('keepMessages'))result={keepMessages:[0,1],keepQuickReplies:[],questionMessage:1,unansweredRequests:[]};
  else result={messages:['收到这份默契啦。','{{question}}'],variant:0,help:'none',quickReplies:[]};
  active--;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model:'isolated-ai',choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:100,completion_tokens:30}}));
});
provider.listen(0,'127.0.0.1');await new Promise(resolve=>provider.once('listening',resolve));
let rotation=0;
const relay=createServer((req,res)=>{
  const port=ports[rotation++%ports.length];if(!port){res.writeHead(503).end();return;}
  const upstream=proxyRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
relay.listen(0,'127.0.0.1');await new Promise(resolve=>relay.once('listening',resolve));
const origin='http://127.0.0.1:'+relay.address().port,scope='load-'+randomUUID();
const quantile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
async function consume(path,cookie,body,trace){
  requests++;const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(trace?{traceparent:`00-${trace}-${randomBytes(8).toString('hex')}-01`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  if(!response.ok){failures++;throw Error(path+': '+response.status);}
  if(path.startsWith('/api/'))return response.json();
  for await(const chunk of response.body)bytes+=chunk.length;
}
try{
  await f.pool.query(await readFile(new URL('../server/blessings/schema.sql',import.meta.url),'utf8'));
  const people=[];for(let i=0;i<100;i++)people.push(await f.participant(1000+i));
  await f.pool.query("UPDATE wedding_game_question_voice SET deck=jsonb_build_object('phrasings',jsonb_build_array(title),'hints','[]'::jsonb,'choices','[]'::jsonb,'source','isolated') WHERE room_id=$1",[f.room]);
  for(let i=0;i<5;i++){
    const child=fork(new URL('./cluster-worker.mjs',import.meta.url),[],{silent:true,env:{...process.env,NODE_ENV:'test',LOG_LEVEL:'info',LOG_FORMAT:'json',INSTANCE_ID:'load-'+i,BLESSINGS_DATABASE_URL:gameTestDatabase,BLESSINGS_DB_SSL:'false',BLESSINGS_ROOM:f.room,BLESSINGS_RATE_SECRET:'isolated-load-secret-32-characters',BLESSINGS_PUBLIC_ORIGIN:origin,GAME_ENABLED:'true',GAME_DATA_KEY:f.runtime.dataKey.toString('hex'),GAME_SESSION_SECRET:f.runtime.sessionSecret,GAME_AI_PROVIDER:'deepseek',GAME_AI_BASE_URL:'http://127.0.0.1:'+provider.address().port,GAME_AI_API_KEY:'isolated-not-a-real-key',GAME_AI_MODEL:'isolated-model',GAME_AI_REVIEW_MODEL:'isolated-model',GAME_AI_ACCOUNT_SCOPE:scope,GAME_AI_MAX_INFLIGHT:'12',GAME_AI_CONCURRENCY:'8'}});
    children.push(child);const capture=()=>{let buffer='';return data=>{buffer+=data;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){try{logs.push(JSON.parse(line));}catch{if(line.trim())logs.push({unstructured:line});}}};};child.stdout.on('data',capture());child.stderr.on('data',capture());
    ports.push(await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('服务未启动')),15000);child.once('message',message=>{clearTimeout(timer);resolve(message.port);});child.once('exit',code=>{if(code)reject(Error('子进程退出 '+code));});}));
  }
  const assets=await readdir('dist/app'),patterns=['invitation-.*\\.js$','game-.*\\.js$','invitation-.*\\.css$','game-.*\\.css$'];
  const staticPaths=['/','/game.html','/music/classic/01-Close%20to%20You-Olivia%20Ong.mp3', '/assets/classic/portrait.webp', '/assets/classic/time.jpg', '/assets/classic/location.jpg', '/assets/classic/closing.jpg', '/assets/shared/rose-petals.webp', '/assets/shared/prize-plush.webp',...patterns.map(pattern=>'/app/'+encodeURIComponent(assets.find(file=>new RegExp(pattern).test(file))))];
  const started=performance.now(),startIds=people.map(()=>randomUUID());
  const staticRun=Promise.allSettled(people.map(async()=>{for(const path of staticPaths)await consume(path);}));
  await Promise.all(people.map((person,i)=>consume('/api/game/conversation/start','wedding_game='+person.token,{requestId:startIds[i]},randomBytes(16).toString('hex'))));
  const waitUntil=async condition=>{const until=Date.now()+90000;while(!await condition()){if(Date.now()>until)throw Error('工作队列处理超时');await delay(250);}};
  await waitUntil(async()=>Number((await f.pool.query("SELECT count(*) FROM wedding_game_chat_turns WHERE room_id=$1 AND kind='start' AND state='complete'",[f.room])).rows[0].count)===100);
  const traces=people.map(()=>randomBytes(16).toString('hex')),ids=people.map(()=>randomUUID()),submitted=performance.now();
  await Promise.all(people.map((person,i)=>consume('/api/game/conversation/messages','wedding_game='+person.token,{requestId:ids[i],text:'测试答案 1'},traces[i])));
  await waitUntil(async()=>Number((await f.pool.query("SELECT count(*) FROM wedding_game_answers WHERE room_id=$1 AND status='correct'",[f.room])).rows[0].count)===100);
  await waitUntil(async()=>Number((await f.pool.query("SELECT count(*) FROM wedding_game_chat_turns WHERE room_id=$1 AND state<>'complete'",[f.room])).rows[0].count)===0);
  const staticResults=await staticRun;assert.ok(staticResults.every(result=>result.status==='fulfilled'));
  const rows=(await f.pool.query("SELECT trace_id,extract(epoch FROM(completed_at-created_at))*1000 AS elapsed FROM wedding_game_chat_turns WHERE room_id=$1 AND kind='message'",[f.room])).rows;
  assert.equal(rows.length,100);assert.equal(new Set(rows.map(row=>row.trace_id)).size,100);assert.ok(rows.every(row=>traces.includes(row.trace_id)));assert.ok(peak<=12);assert.equal(failures,0);
  const latencies=rows.map(row=>Number(row.elapsed)),workers=[...new Set(logs.filter(row=>row.event==='job.started').map(row=>row.instance))];
  const report={generatedAt:new Date().toISOString(),scope:'本机五个Node进程、100个验证会话、轮询负载均衡、真实PostgreSQL；模型为250ms本机模拟器，不发送短信。',replicas:5,visitors:100,modelDelayMs:250,sharedModelLimit:12,peakModelConcurrency:peak,modelCalls,httpRequests:requests,httpFailures:failures,staticBytes:bytes,staticPaths,answerLatencyMs:{p50:quantile(latencies,.5),p95:quantile(latencies,.95),max:Math.max(...latencies)},answerPhaseMs:Math.round(performance.now()-submitted),totalMs:Math.round(performance.now()-started),workers,traceIdsPersisted:rows.length,passed:true};
  assert.ok(traces.every(trace=>logs.some(row=>row.trace_id===trace&&row.event==='job.started')),'排队请求的链路延续到工作进程');
  await writeFile('.temp/reports/cluster-load-report.json',JSON.stringify(report,null,2)+'\n');await writeFile('.temp/reports/wedding-cluster-load.ndjson',logs.map(row=>JSON.stringify(row)).join('\n')+'\n');console.log(JSON.stringify(report));
}catch(error){await writeFile('.temp/reports/cluster-load-report.json',JSON.stringify({generatedAt:new Date().toISOString(),passed:false,error:error.message},null,2)+'\n');throw error;}finally{
  await writeFile('.temp/reports/wedding-cluster-load.ndjson',logs.map(row=>JSON.stringify(row)).join('\n')+'\n');
  for(const child of children){child.send?.('stop');}
  await Promise.allSettled(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill();resolve();},15000);child.once('exit',()=>{clearTimeout(timer);resolve();});})));
  relay.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise(resolve=>relay.close(resolve)),new Promise(resolve=>provider.close(resolve))]);
  await f.pool.query('DELETE FROM wedding_ai_leases WHERE scope=$1',[scope]);await f.pool.query('DELETE FROM wedding_ai_controls WHERE scope=$1',[scope]);await f.close();
}
