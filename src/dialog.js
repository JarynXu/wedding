import './dialog.css';

/** 全站小弹窗：确认只来自按钮操作，关闭和 Escape 均按取消处理。 */
export class InvitationDialogs {
  constructor() {
    this.queue = [];
    this.dialog = document.createElement('dialog'); this.dialog.className = 'invitation-dialog';
    this.dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="关闭">×</button><h2></h2><div class="dialog-content"></div><div class="dialog-actions"></div>';
    this.dialog.querySelector('.dialog-close').onclick = () => this.finish(false);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.finish(false); });
    this.dialog.addEventListener('keydown', event => { if(event.key==='Escape')event.stopPropagation(); });
    this.dialog.addEventListener('click', event => { const r=this.dialog.getBoundingClientRect(); if(event.target===this.dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))this.finish(false); });
    document.body.append(this.dialog);
  }
  show(options) {
    return new Promise(resolve => { this.queue.push({ ...options, resolve }); this.advance(); });
  }
  alert(message, title = '小提示') { return this.show({ title, content: message }); }
  advance() {
    if (this.active || !this.queue.length) return;
    const item = this.active = this.queue.shift();
    this.returnFocus = document.activeElement;
    const heading=this.dialog.querySelector('h2'); heading.textContent=item.title; heading.id='invitationDialogTitle';
    this.dialog.setAttribute('aria-labelledby',heading.id);
    const content=this.dialog.querySelector('.dialog-content'); content.replaceChildren();
    if(typeof item.content==='string')content.textContent=item.content;else content.append(item.content);
    const actions=this.dialog.querySelector('.dialog-actions'); actions.replaceChildren();
    if(item.cancelText)actions.append(this.action(item.cancelText,false,'dialog-secondary'));
    actions.append(this.action(item.confirmText || '知道了',true,'dialog-primary'));
    this.dialog.dataset.kind=item.kind || 'notice';
    this.dialog.showModal();
  }
  action(label,value,className) { const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.onclick=()=>this.finish(value);return b; }
  finish(value) {
    if(!this.active)return;
    const item=this.active;this.active=null;this.dialog.close();item.resolve(value);
    if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});
    this.advance();
  }
  destroy() { const active=this.active;this.active=null;active?.resolve(false);this.queue.splice(0).forEach(item=>item.resolve(false));this.dialog.remove(); }
}
