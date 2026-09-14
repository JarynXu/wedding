import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { formatLog, logOptions } from './log-format.js';

const context = new AsyncLocalStorage();
const instance = process.env.INSTANCE_ID || `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;
const levels = { debug:10, info:20, warn:30, error:40, silent:100 };
const permitted = new Set(['request_id','trace_id','span_id','parent_span_id','room','participant_id','job_id','job_kind','business_id','version','generation','status','stage','duration_ms','queue_ms','attempt','model','provider','provider_request_id','input_tokens','output_tokens','verdict','source','reason','active','limit','wait_ms','rows','path','method','build_id','commit','error_code','error_type','stack','counts']);

export function traceContext() { return context.getStore() || {}; }
export function withTrace(fields, operation) { return context.run({ ...traceContext(), ...fields }, operation); }
export function traceparent() { const value=traceContext(); return value.trace_id&&value.span_id?`00-${value.trace_id}-${value.span_id}-01`:undefined; }
export function providerUserId() { const value=traceContext();return value.participant_id?createHash('sha256').update(`wedding:${value.room}:${value.participant_id}`).digest('hex'):undefined; }

/** 日志只接收允许的诊断字段；请求正文、凭据和宾客原文留在受权查询的数据记录中。 */
export function log(event, fields={}, level='info') {
  if((levels[level]||20)<(levels[process.env.LOG_LEVEL]||20))return;
  const values={...traceContext(),...fields},data={time:new Date().toISOString(),level,event,service:process.env.LOG_SERVICE||'wedding',instance};
  for(const [key,value]of Object.entries(values))if(permitted.has(key)&&value!==undefined)data[key]=key==='counts'?Object.fromEntries(Object.entries(value||{}).filter(([name,count])=>/^[a-z_]+$/.test(name)&&Number.isSafeInteger(count)&&count>=0)):value;
  const stream=level==='error'||level==='warn'?process.stderr:process.stdout;
  stream.write(formatLog(data,logOptions(process.env,stream)));
}
export function logError(event,error,fields={}) {
  log(event,{...fields,error_type:error?.name||'Error',error_code:error?.code||error?.status||'UNKNOWN',stack:typeof error?.stack==='string'?error.stack.split('\n').filter(line=>/^\s+at /.test(line)).slice(0,8):undefined},'error');
}
export function jobTrace(job,room,kind,operation) {
  return withTrace({trace_id:job.trace_id||randomBytes(16).toString('hex'),parent_span_id:job.parent_span_id||undefined,span_id:randomBytes(8).toString('hex'),room,participant_id:job.participant_id,job_id:String(job.id||job.question_id),job_kind:kind},operation);
}
export function requestTracing(build={}) {
  return (request,response,next)=>{
    const incoming=/^00-([a-f0-9]{32})-([a-f0-9]{16})-[a-f0-9]{2}$/i.exec(request.get('traceparent')||'');
    const valid=incoming&&!/^0+$/.test(incoming[1])&&!/^0+$/.test(incoming[2]);
    const fields={trace_id:valid?incoming[1].toLowerCase():randomBytes(16).toString('hex'),span_id:randomBytes(8).toString('hex'),parent_span_id:valid?incoming[2].toLowerCase():undefined,request_id:randomUUID(),build_id:build.buildId||build.build,commit:build.commit};
    withTrace(fields,()=>{
      const started=performance.now();response.set('X-Request-ID',fields.request_id);response.set('traceparent',traceparent());
      let completed=false;
      const finish=()=>{if(completed)return;completed=true;
        const path=request.route?.path?request.baseUrl+String(request.route.path):request.path.startsWith('/assets/')?'/assets/:file':'unmatched';
        if(response.statusCode<400&&request.path.startsWith('/assets/')&&process.env.LOG_HTTP_ASSETS!=='true')return;
        log('http.complete',{...fields,method:request.method,path,status:response.destroyed&&!response.writableFinished?499:response.statusCode,duration_ms:Math.round(performance.now()-started)},response.statusCode>=500?'error':'info');
      };
      response.on('finish',finish);response.on('close',finish);next();
    });
  };
}
