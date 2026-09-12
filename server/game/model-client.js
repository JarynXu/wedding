/** 供应商协议差异保留在此边界；调用者只接收完整 JSON 文本和可核对的用量。 */
export class JsonModelClient {
  constructor(config){this.config=config;}
  async complete({model,messages,schema},signal) {
    const options=this.config.provider==='deepseek'
      ? {response_format:{type:'json_object'},max_tokens:800,thinking:{type:'disabled'},temperature:0}
      : {response_format:{type:'json_schema',json_schema:{name:'wedding_answer_verdict',strict:true,schema}},max_completion_tokens:800,store:false};
    const started=Date.now();
    const response=await fetch(this.config.baseUrl+'/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.key}`},
      signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(35000)]),
      body:JSON.stringify({model,messages,...options}),
    });
    if(!response.ok)throw new Error(`AI_HTTP_${response.status}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>32000)throw new Error('AI_RESPONSE_TOO_LARGE');chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),choice=body.choices?.[0];
    if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof choice.message?.content!=='string')throw new Error('AI_INCOMPLETE');
    const tokenCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    return {text:choice.message.content,model:typeof body.model==='string'?body.model:model,durationMs:Date.now()-started,
      usage:{inputTokens:tokenCount(body.usage?.prompt_tokens),outputTokens:tokenCount(body.usage?.completion_tokens)}};
  }
}
