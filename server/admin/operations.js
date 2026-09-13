const labels={wedding_blessings:'祝福和礼物',wedding_blessing_writing:'祝福润色记录',wedding_game_participants:'参与者与登录',wedding_game_answers:'答卷',wedding_game_chat_turns:'聊天记录',wedding_game_otps:'验证码记录',wedding_game_prizes:'兑奖记录'};
export class OperationsPanel {
  constructor({root,request,onChange}){
    Object.assign(this,{root,request,onChange});
    root.innerHTML='<div class="section-heading"><h3>试运行数据清理</h3><button class="small-button" type="button" data-inspect>核对数据</button></div><p class="section-intro">清空会删除本场祝福、参与者、聊天、答卷及兑奖记录，并注销宾客登录。题库、奖项设置、现场资料和管理员配置保留。删除后不可恢复。</p><div data-summary></div><div class="form-actions"><button class="secondary-button" type="button" data-pause>暂停互动</button></div><form hidden><label class="field-group"><span>输入“清空试运行数据”确认</span><input name="confirmation" autocomplete="off"></label><label class="field-group"><span>管理员密码</span><input name="password" type="password" autocomplete="current-password"></label><button class="danger-button" type="submit">清空上方业务记录</button></form><p class="inline-message" role="status"></p>';
    this.status=root.querySelector('[role=status]');this.summary=root.querySelector('[data-summary]');this.form=root.querySelector('form');this.pauseButton=root.querySelector('[data-pause]');
    root.querySelector('[data-inspect]').onclick=()=>this.inspect();
    this.pauseButton.onclick=async()=>{try{await this.request('/admin/api/operations/pause',{method:'POST',body:JSON.stringify({paused:!this.snapshot?.paused})});await this.inspect();await onChange();}catch(error){this.status.textContent=error.message;}};
    this.form.onsubmit=event=>{event.preventDefault();this.reset();};
  }
  async inspect(){
    try{
      const data=await this.request('/admin/api/operations');if(data.token!==this.snapshot?.token)this.resetRequest=null;this.snapshot=data;this.summary.replaceChildren();
      if(!data.enabled){this.status.textContent='当前环境未同时启用游戏与祝福服务。';this.pauseButton.disabled=true;return;}
      for(const [key,count]of Object.entries(data.counts)){const line=document.createElement('p');line.textContent=`${labels[key]||key}：${count}`;this.summary.append(line);}
      this.pauseButton.textContent=data.paused?'结束清理，恢复互动':'暂停互动';this.form.hidden=!data.paused||data.active>0;
      this.status.textContent=data.active?`仍有 ${data.active} 项互动等待结果，请稍后重新核对。`:data.paused?'互动已暂停。确认上方范围后再清空。':'先暂停互动，让已接收的请求处理完毕。';
    }catch(error){this.status.textContent=error.message;}
  }
  async reset(){
    const submit=this.form.querySelector('[type=submit]');submit.disabled=true;
    try{
      this.resetRequest ||= crypto.randomUUID();
      await this.request('/admin/api/operations/reset',{method:'POST',body:JSON.stringify({requestId:this.resetRequest,token:this.snapshot.token,confirmation:this.form.elements.confirmation.value,password:this.form.elements.password.value})});
      this.form.reset();await this.inspect();this.status.textContent='业务记录已清空。结束清理后，请到游戏设置开放正式活动。';await this.onChange();
    }catch(error){this.status.textContent=error.message;}finally{this.form.elements.password.value='';submit.disabled=false;}
  }
}
