import { haptic } from '../haptics.js';
const node=(tag,className,text='')=>{const element=document.createElement(tag);element.className=className;element.textContent=text;return element;};

/** 连续对话保留节点、草稿与阅读位置；翻看旧消息不强行跳回底部。 */
export class ConversationView {
  constructor({request,notice,uuid,owner,showClaim,onActivity,isActive=()=>true}){
    Object.assign(this,{request,notice,uuid,owner,showClaim,onActivity,isActive});
    this.elements=new Map();this.nudged=new Set();this.lastInteraction=Date.now();this.snapshot={turns:[]};
    try{const saved=JSON.parse(sessionStorage.getItem('wedding.game.chat.pending'));if(saved?.owner===owner)this.pending=saved;}catch{}
    this.root=node('section','conversation-room');this.root.setAttribute('aria-label','与喜宴司仪的聊天');
    this.log=node('div','conversation-log');this.log.setAttribute('role','log');this.log.setAttribute('aria-live','polite');this.root.append(this.log);
    this.typing=node('div','conversation-typing');this.typing.setAttribute('role','status');this.root.append(this.typing);
    this.claim=node('button','conversation-claim','查看领礼凭证');this.claim.type='button';this.claim.hidden=true;this.claim.onclick=showClaim;this.root.append(this.claim);
    const form=node('form','conversation-composer');form.noValidate=true;
    this.input=node('textarea','');this.input.id='gameAnswer';this.input.rows=1;this.input.maxLength=640;this.input.placeholder='说说你的答案…';this.input.setAttribute('aria-label','聊天消息');this.input.value=this.pending?.text||'';
    this.sendButton=node('button','','发送');this.sendButton.type='submit';
    form.append(this.input,this.sendButton);this.root.append(form);
    form.onsubmit=event=>{event.preventDefault();this.send(this.input.value,true);};
    this.input.oninput=()=>{this.lastInteraction=Date.now();this.input.style.height='auto';this.input.style.height=Math.min(108,this.input.scrollHeight)+'px';};
    this.input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();this.send(this.input.value,true);}};
    this.log.onscroll=()=>{if(!this.atBottom())this.lastInteraction=Date.now();};
    this.events=new AbortController();
    this.timer=setInterval(()=>{if(Date.now()-(this.lastRefresh||0)>(this.waiting?800:3500))this.refresh();this.nudge();},800);
    this.start();
  }
  async start(){
    this.starting=true;
    this.typing.textContent='喜宴司仪正在过来…';
    try{await this.request('/conversation/start',{requestId:this.uuid()});await this.refresh();}catch(error){this.notice(error.message);}finally{this.starting=false;this.render();}
  }
  update(me,config){if(this.me&&me.participant.score>this.me.participant.score&&this.isActive()&&!document.hidden)haptic('correct');this.me=me;this.config=config;this.claim.hidden=!me.claim;this.input.placeholder=me.participant.answered>=config.questions.length||config.phase!=='open'?'婚礼时间、地点，都可以问我…':'说说你的答案…';this.render();}
  get waiting(){return this.snapshot.turns.some(turn=>turn.state!=='complete');}
  atBottom(){return this.log.scrollHeight-this.log.scrollTop-this.log.clientHeight<70;}
  savePending(){try{sessionStorage.setItem('wedding.game.chat.pending',JSON.stringify(this.pending||null));}catch{}}
  async send(raw,fromComposer=false){
    if(this.sending||this.destroyed)return;
    const text=raw.trim();if(!text||[...text].length>320){this.notice('写一句想说的话吧，控制在320字以内。');return;}
    if(this.pending&&this.pending.text!==text){this.notice('刚才那句话还没确认收到，先点“再发一次”试试。');return;}
    const original=this.input.value;
    this.pending||={requestId:this.uuid(),text,owner:this.owner};this.savePending();this.sending=true;this.sendButton.disabled=true;this.lastInteraction=Date.now();this.render();
    try{
      await this.request('/conversation/messages',this.pending);
      if(this.destroyed)return;
      this.pending=null;this.savePending();if(fromComposer&&this.input.value===original){this.input.value='';this.input.style.height='auto';}
      await this.refresh();
    }catch(error){if(!this.destroyed&&this.pending){this.pending.failed=true;this.savePending();this.notice(error.message);}}
    finally{this.sending=false;this.sendButton.disabled=false;this.render();}
  }
  async refresh(){
    if(this.refreshing||this.destroyed||!this.isActive()||document.hidden||!this.root.isConnected)return;
    this.refreshing=true;
    try{
      const snapshot=await this.request('/conversation');if(this.destroyed)return;
      this.snapshot=snapshot;this.errorShown=false;
      if(!snapshot.turns.length&&!this.starting)this.start();
      if(this.pending&&snapshot.turns.some(turn=>turn.requestId===this.pending.requestId)){this.pending=null;this.savePending();}
      this.render();this.onActivity?.();
    }catch(error){if(!this.destroyed&&!this.errorShown){this.errorShown=true;this.notice(error.message);}}
    finally{this.refreshing=false;this.lastRefresh=Date.now();}
  }
  render(){
    if(this.destroyed)return;
    const bottom=this.atBottom(),items=[];
    for(const turn of this.snapshot.turns){
      if(turn.input)items.push({key:'guest:'+turn.requestId,role:'guest',text:turn.input,retry:turn.reply?.retryable,requestId:turn.requestId});
      turn.reply?.messages.forEach((text,index)=>items.push({key:`host:${turn.id}:${index}`,role:'host',text}));
      if(turn.reply?.choices?.length)items.push({key:'choices:'+turn.id,role:'choices',values:turn.reply.choices,questionId:turn.reply.questionId});
      if(turn.reply?.quickReplies?.length&&turn===this.snapshot.turns.at(-1))items.push({key:'quick:'+turn.id,role:'quick',values:turn.reply.quickReplies});
    }
    if(this.pending&&!this.snapshot.turns.some(turn=>turn.requestId===this.pending.requestId))items.push({key:'guest:'+this.pending.requestId,role:'guest',text:this.pending.text,retry:this.pending.failed});
    const retained=new Set();
    items.forEach((item,index)=>{
      retained.add(item.key);let element=this.elements.get(item.key);
      if(!element){element=node('div','conversation-message conversation-'+item.role);this.elements.set(item.key,element);}
      const signature=JSON.stringify(item)+(item.role==='choices'?this.snapshot.activeQuestion:'');
      if(element.dataset.signature!==signature){
        element.replaceChildren();element.dataset.signature=signature;
        if(item.text){element.append(node('p','',item.text));if(item.retry){const retry=node('button','conversation-retry','再发一次');retry.type='button';retry.onclick=()=>{if(!this.pending&&item.requestId)this.pending={requestId:item.requestId,text:item.text,owner:this.owner};this.send(item.text);};element.append(retry);}}
        else item.values.forEach((value,i)=>{const choice=node('button','',item.role==='choices'?`${String.fromCharCode(65+i)} · ${value}`:value);choice.type='button';choice.disabled=item.role==='choices'&&item.questionId!==this.snapshot.activeQuestion;choice.onclick=()=>this.send(value);element.append(choice);});
      }
      if(this.log.children[index]!==element)this.log.insertBefore(element,this.log.children[index]||null);
    });
    for(const [key,element]of this.elements)if(!retained.has(key)){element.remove();this.elements.delete(key);}
    const pending=this.snapshot.turns.find(turn=>turn.state!=='complete');
    this.typing.textContent=pending?({thinking:'让我想想…',checking:'让我核对一下…',replying:'喜宴司仪正在接话…'}[pending.progress]||'喜宴司仪正在接话…'):this.starting?'喜宴司仪正在过来…':'';
    this.typing.hidden=!pending&&!this.starting;
    if(bottom)requestAnimationFrame(()=>{if(!this.destroyed)this.log.scrollTop=this.log.scrollHeight;});
  }
  async nudge(){
    const question=this.snapshot.activeQuestion;
    if(this.destroyed||!this.isActive()||document.hidden||!this.root.isConnected||this.config?.phase!=='open'||!question||this.waiting||this.sending||this.input.value.trim()||!this.atBottom()||Date.now()-this.lastInteraction<35000||this.nudged.has(question)||document.querySelector('dialog[open]'))return;
    this.nudged.add(question);
    try{await this.request('/conversation/nudge',{requestId:this.uuid()});await this.refresh();}catch{ /* 不用一条主动接话打断来宾。 */ }
  }
  destroy(){this.destroyed=true;clearInterval(this.timer);this.events.abort();this.root.remove();}
}
