import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { log, logError, traceparent, providerUserId, traceContext, withTrace } from '../observability.js';

export class AiServiceError extends Error {
  constructor(code,{status,retryable=false,retryAfterMs=1000}={}) { super(code);this.name='AiServiceError';Object.assign(this,{code,status,retryable,retryAfterMs}); }
}

/** 共享配额、供应商退避和诊断保留在边界，失败不得变为正常判分。 */
export class JsonModelClient {
  constructor(config,{gate=null}={}){this.config=config;this.gate=gate;}
  complete(input,signal){const parent=traceContext();return withTrace({trace_id:parent.trace_id||randomBytes(16).toString('hex'),parent_span_id:parent.span_id,span_id:randomBytes(8).toString('hex'),stage:input.operation||'model'},()=>this.run(input,signal));}
  async run(input,signal) {
    const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(35000)]);
    for(let attempt=0;attempt<3;attempt++){
      let lease;
      try {lease=await this.gate?.acquire(bounded);return await this.call(input,bounded,attempt);}
      catch(error){
        if(bounded.aborted)error=new AiServiceError('AI_TIMEOUT',{retryable:true});
        if(!(error instanceof AiServiceError)&&!bounded.aborted)error=new AiServiceError(error.code||'AI_NETWORK',{retryable:error instanceof TypeError});
        logError('ai.failed',error,{model:input.model,provider:this.config.provider,attempt});
        if(!error.retryable||attempt===2||bounded.aborted)throw error;
        const wait=Math.max(error.retryAfterMs,500*2**attempt)+Math.floor(Math.random()*150);
        if(this.gate&&[429,503].includes(error.status))await this.gate.cooldown(wait);
        log('ai.retry',{model:input.model,status:error.status,attempt:attempt+1,wait_ms:wait},'warn');
        try { await delay(wait,undefined,{signal:bounded}); }
        catch { throw new AiServiceError('AI_TIMEOUT',{retryable:true,retryAfterMs:wait}); }
      }finally{if(lease)await this.gate.release(lease).catch(error=>logError('ai.permit_release_failed',error));}
    }
  }
  async call({model,messages,schema,temperature=0},signal,attempt) {
    const options=this.config.provider==='deepseek'
      ? {response_format:{type:'json_object'},max_tokens:800,thinking:{type:'disabled'},temperature,...(providerUserId()?{user_id:providerUserId()}:{})}
      : {response_format:{type:'json_schema',json_schema:{name:'wedding_answer_verdict',strict:true,schema}},max_completion_tokens:800,store:false};
    const started=performance.now(),parent=traceparent();
    log('ai.started',{model,provider:this.config.provider,attempt});
    const response=await fetch(this.config.baseUrl+'/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.key}`,...(parent?{traceparent:parent}:{})},
      signal,body:JSON.stringify({model,messages,...options}),
    });
    if(!response.ok){
      const raw=response.headers.get('retry-after');await response.body?.cancel();
      const parsed=raw?(Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-Date.now()):1000;
      throw new AiServiceError(`AI_HTTP_${response.status}`,{status:response.status,retryable:[429,500,502,503,504].includes(response.status),retryAfterMs:Number.isFinite(parsed)?Math.max(0,parsed):1000});
    }
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>32000)throw new AiServiceError('AI_RESPONSE_TOO_LARGE');chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AiServiceError('AI_INVALID_JSON');}
    const choice=body.choices?.[0];
    if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof choice.message?.content!=='string'||!choice.message.content.trim())throw new AiServiceError('AI_INCOMPLETE');
    const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    const result={text:choice.message.content,model:typeof body.model==='string'?body.model:model,durationMs:Math.round(performance.now()-started),usage:{inputTokens:count(body.usage?.prompt_tokens),outputTokens:count(body.usage?.completion_tokens)}};
    log('ai.completed',{model:result.model,provider:this.config.provider,status:response.status,attempt,duration_ms:result.durationMs,input_tokens:result.usage.inputTokens,output_tokens:result.usage.outputTokens,provider_request_id:response.headers.get('x-request-id')?.slice(0,128)});
    return result;
  }
}
