import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { JsonModelClient } from '../server/ai/model-client.js';
import { withTrace } from '../server/observability.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('模型调用透传链路、隔离用户并遵守429退避',async()=>{
  let attempts=0;const received=[];
  const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received.push({trace:req.headers.traceparent,body:JSON.parse(raw)});attempts++;if(attempts===1){res.writeHead(429,{'Retry-After':'0'}).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:12,completion_tokens:4}}));});
  server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const model=new JsonModelClient({provider:'deepseek',baseUrl:'http://127.0.0.1:'+server.address().port,key:'isolated-key'}),trace='a'.repeat(32);
    const result=await withTrace({trace_id:trace,span_id:'b'.repeat(16),participant_id:'private-participant-id',room:'test-room'},()=>model.complete({operation:'test_judging',model:'isolated',messages:[{role:'user',content:'test'}],schema:{}}));
    assert.equal(attempts,2);assert.equal(result.usage.inputTokens,12);
    assert.ok(received.every(call=>call.trace.startsWith('00-'+trace+'-')));
    assert.ok(received.every(call=>/^[a-f0-9]{64}$/.test(call.body.user_id)));assert.equal(received[0].body.operation,undefined);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('容器日志为JSON行，敏感正文和错误消息不会写出',async()=>{
  const source=`import {log,logError,withTrace} from './server/observability.js';withTrace({trace_id:'a'.repeat(32),span_id:'b'.repeat(16)},()=>{log('test',{password:'secret-password',phone:'13999999999',body:'guest-private',counts:{password:'secret-count',records:2}});logError('failed',new Error('private-code-and-key'));});`;
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{cwd:process.cwd(),env:{...process.env,LOG_LEVEL:'info',LOG_FORMAT:'json'}});
  const output=result.stdout+result.stderr,rows=output.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.trace_id==='a'.repeat(32)&&row.instance));
  assert.doesNotMatch(output,/secret-password|13999999999|guest-private|private-code-and-key|secret-count/);assert.deepEqual(rows[0].counts,{records:2});
});


test('模型退避被时间预算中断时保留可重试语义',async()=>{
  const server=createServer((_req,res)=>res.writeHead(429,{'Retry-After':'10'}).end());
  server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const model=new JsonModelClient({provider:'deepseek',baseUrl:'http://127.0.0.1:'+server.address().port,key:'test'});
    await assert.rejects(model.complete({model:'test',messages:[],schema:{}},AbortSignal.timeout(150)),{code:'AI_TIMEOUT',retryable:true});
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
