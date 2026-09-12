export class KnowledgeEditor {
  constructor({root,request,onAuthError}) {
    Object.assign(this,{root,request,onAuthError}); this.version=0;
    root.innerHTML='<div class="section-heading"><h3>现场资料与彩蛋</h3><button type="button" class="small-button" data-reload>重新读取</button></div><p class="section-intro">这里的内容允许宾客随时向婚礼助手询问。填写现场互动的题目、公开答案和可用于引起兴趣的彩蛋引子；不要放入需要保密的竞猜答案。</p><form><label class="confirm-row"><input type="checkbox" name="enabled">向宾客开放这些资料</label><div class="knowledge-entries"></div><button type="button" class="small-button" data-add>增加一条资料</button><div class="form-actions"><button class="primary-button" type="submit">保存公开资料</button></div></form><p class="inline-message" role="status"></p>';
    this.list=root.querySelector('.knowledge-entries');this.form=root.querySelector('form');this.status=root.querySelector('[role=status]');
    root.querySelector('[data-add]').onclick=()=>{if(this.list.children.length<12)this.add();};
    root.querySelector('[data-reload]').onclick=()=>this.load(true);
    this.form.onsubmit=event=>{event.preventDefault();this.save();};
  }
  add(entry={question:'',answer:'',teaser:''}) {
    const field=document.createElement('fieldset');field.className='question-editor';
    for(const [key,label,rows]of[['question','现场问题 / 资料主题',2],['answer','允许公开的回答',4],['teaser','彩蛋引子',2]]){
      const wrapper=document.createElement('label');wrapper.className='field-group';const title=document.createElement('span');title.textContent=label;
      const input=document.createElement('textarea');input.name=key;input.rows=rows;input.value=entry[key];input.maxLength=key==='answer'?600:key==='question'?160:100;wrapper.append(title,input);field.append(wrapper);
    }
    const remove=document.createElement('button');remove.type='button';remove.className='small-button';remove.textContent='删除这条';remove.onclick=()=>field.remove();field.append(remove);this.list.append(field);
  }
  async load(force=false) {
    if(this.loaded&&!force)return;
    try {const data=await this.request('/admin/api/game/knowledge');this.version=data.version;this.form.elements.enabled.checked=data.enabled;this.list.replaceChildren();data.entries.forEach(entry=>this.add(entry));if(!data.entries.length)this.add();this.loaded=true;this.status.textContent='';}
    catch(error){if(!this.onAuthError(error))this.status.textContent=error.message;}
  }
  async save() {
    const submit=this.form.querySelector('[type=submit]');submit.disabled=true;
    try {
      const entries=[...this.list.children].map(field=>Object.fromEntries([...field.querySelectorAll('textarea')].map(input=>[input.name,input.value.trim()]))).filter(entry=>entry.question||entry.answer||entry.teaser);
      const data=await this.request('/admin/api/game/knowledge',{method:'PUT',body:JSON.stringify({expectedVersion:this.version,enabled:this.form.elements.enabled.checked,entries})});
      this.version=data.version;this.status.textContent=data.enabled?'资料已保存并向宾客开放。':'资料已保存，目前不向宾客开放。';
    }catch(error){if(!this.onAuthError(error))this.status.textContent=error.message;}finally{submit.disabled=false;}
  }
}
