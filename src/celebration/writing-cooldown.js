/** 冷却与请求忙碌分别持有状态；结束网络请求不提前解除冷却。 */
export class WritingCooldown {
  constructor(button,{read,write,label,blocked=()=>false,clock=()=>Date.now()}) {
    Object.assign(this,{button,read,write,label,blocked,clock});
    this.until=Number(read())||0;
    this.onStorage=()=>this.refresh();window.addEventListener('storage',this.onStorage);
    this.refresh();
  }
  get remaining(){return Math.max(0,Math.ceil((Math.max(this.until,Number(this.read())||0)-this.clock())/1000));}
  setBusy(busy){this.busy=busy;this.refresh();}
  wait(seconds){
    if(!Number.isFinite(seconds)||seconds<=0)return;
    this.duration=seconds;this.until=Math.max(this.until,this.clock()+seconds*1000);this.write(this.until);this.refresh();
  }
  refresh(){
    if(this.destroyed)return;
    clearTimeout(this.timer);
    const remaining=this.remaining;
    this.button.disabled=Boolean(this.busy||remaining||this.blocked());
    this.button.dataset.state=this.busy?'writing':remaining?'cooling':'ready';
    this.button.textContent=this.busy?'✧ …':remaining?`✧ ${remaining>=60?Math.ceil(remaining/60)+'m':remaining+'s'}`:'✧ AI';
    this.button.setAttribute('aria-label',this.busy?'正在写祝福':remaining?`${remaining}秒后可再写一份祝福`:this.label());
    this.button.setAttribute('aria-busy',String(Boolean(this.busy)));
    this.button.style.setProperty('--ai-ready',String(1-Math.min(1,remaining/(this.duration||20))));
    if(remaining)this.timer=setTimeout(()=>this.refresh(),250);
  }
  destroy(){this.destroyed=true;clearTimeout(this.timer);window.removeEventListener('storage',this.onStorage);}
}
