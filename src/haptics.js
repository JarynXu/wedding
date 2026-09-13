const patterns={tap:[8],send:[14],correct:[18,45,28],fireworks:[12,35,24]};

/** 触感仅补充当前操作；后台、减少动态效果和不支持的设备不发出振动。 */
export class HapticFeedback {
  constructor(host,clock=()=>Date.now()) {
    this.host=host;this.clock=clock;this.next=0;
    this.motion=host.matchMedia('(prefers-reduced-motion: reduce)');
    this.stop=()=>{if(host.document.hidden)this.cancel();};
    host.document.addEventListener('visibilitychange',this.stop);
  }
  pulse(kind){
    const pattern=patterns[kind],{navigator,document}=this.host;
    if(!pattern||document.hidden||this.motion.matches||typeof navigator.vibrate!=='function'||navigator.userActivation?.hasBeenActive===false||this.clock()<this.next)return false;
    this.next=this.clock()+(kind==='fireworks'?650:kind==='correct'?400:100);
    try{return navigator.vibrate(pattern);}catch{return false;}
  }
  cancel(){try{this.host.navigator.vibrate?.(0);}catch{}}
  destroy(){this.cancel();this.host.document.removeEventListener('visibilitychange',this.stop);}
}

export function haptic(kind){
  let owner=window;
  try{if(window.parent!==window&&window.parent.location.origin===window.location.origin)owner=window.parent;}catch{}
  const key=Symbol.for('wedding.haptics');owner[key] ||= new HapticFeedback(owner);
  return owner[key].pulse(kind);
}

/** 一次可信点击只给一次短反馈；网络结果、答对与烟花使用各自事件。 */
export function bindHapticControls(root,signal){
  root.addEventListener('click',event=>{
    const control=event.target.closest?.('button,a');
    if(event.isTrusted&&control&&!control.disabled&&!control.matches('[data-quick-gift],[data-haptic="off"]'))haptic('tap');
  },{signal});
}
