import { prizeArt, prizeName } from './prizes.js';
const node=(tag,className,text='')=>{const element=document.createElement(tag);element.className=className;element.textContent=text;return element;};

/** 实时榜单复用行节点，更新排序时保留来宾正在阅读的位置。 */
export class LeaderboardView {
  constructor({refresh}={}) {
    this.refresh=refresh;this.touchStart=null;this.pullDistance=0;
    this.root=node('section','leaderboard-room');this.root.setAttribute('aria-label','默契榜');
    this.personal=node('div','game-personal-prize');this.personal.hidden=true;
    this.pull=node('div','game-pull-refresh','下拉刷新');this.pull.setAttribute('role','status');
    this.empty=node('p','game-empty','正在展开默契榜…');this.list=node('ol','game-leaderboard');this.list.tabIndex=0;
    this.root.append(this.personal,this.pull,this.empty,this.list);this.rows=new Map();
    this.list.addEventListener('touchstart',event=>{this.touchStart=event.touches.length===1&&this.list.scrollTop<=0?event.touches[0].clientY:null;},{passive:true});
    this.list.addEventListener('touchmove',event=>{if(this.touchStart===null||this.refreshing||event.touches.length!==1)return;const distance=event.touches[0].clientY-this.touchStart;if(distance<=0)return;if(event.cancelable)event.preventDefault();this.pullDistance=Math.min(60,distance*.45);this.pull.style.height=this.pullDistance+'px';this.pull.textContent=this.pullDistance>=44?'松开刷新':'下拉刷新';},{passive:false});
    this.list.addEventListener('touchend',()=>this.finishPull());this.list.addEventListener('touchcancel',()=>{this.touchStart=null;this.pullDistance=0;this.pull.style.height='0px';});
  }
  async finishPull(){
    this.touchStart=null;if(this.refreshing)return;
    if((this.pullDistance||0)>=44){this.refreshing=true;this.pull.style.height='30px';this.pull.textContent='正在刷新';try{await this.refresh?.();}finally{this.refreshing=false;}}
    this.pullDistance=0;this.pull.style.height='0px';
  }
  update(board,me=null) {
    if('personal' in board)me=board.personal?{...board.personal,claim:me?.claim}:null;
    const prize=me?.potentialPrize;
    this.personal.hidden=!me;this.personal.replaceChildren();
    if(me){
      if(prize){this.personal.append(prizeArt(prize.kind));const text=node('div','');text.append(node('small','',(prize.awarded?'你的奖品':'暂定奖品')+(prize.name?' · '+prize.name:'')),node('strong','',prizeName(prize.kind)),node('span','',prize.awarded?(me.claim?.redeemedAt?'已领取':'婚礼现场领取'):'名单仍在变动'));this.personal.append(text);}
      else this.personal.append(node('span','',`已答对 ${me.participant.score} 题`),node('small','','还没有进入奖品名单'));
    }
    const top=this.list.scrollTop,box=this.list.getBoundingClientRect();
    const anchor=[...this.list.children].find(row=>row.getBoundingClientRect().bottom>box.top);
    const offset=anchor?anchor.getBoundingClientRect().top-box.top:0;
    const retained=new Set();
    board.entries.forEach((entry,index)=>{
      const key=entry.id;retained.add(key);let row=this.rows.get(key);
      if(!row){row=node('li','');this.rows.set(key,row);}
      const signature=JSON.stringify(entry);
      if(row.dataset.signature!==signature){
        row.dataset.signature=signature;row.replaceChildren(node('span','game-rank',String(entry.rank).padStart(2,'0')),node('span','game-rank-name',entry.name),node('strong','',`${entry.score} 题`));
        if(entry.potentialPrize){const gift=node('div','game-rank-prize');gift.append(prizeArt(entry.potentialPrize.kind),node('span','',(entry.potentialPrize.name?entry.potentialPrize.name+' · ':'')+prizeName(entry.potentialPrize.kind)));row.append(gift);}
        else if(entry.prize)row.append(node('small','',entry.prize));
        else if(entry.podiumPlace)row.append(node('small','',`六题全对 · 暂列前三第 ${entry.podiumPlace} 位`));
      }
      if(this.list.children[index]!==row)this.list.insertBefore(row,this.list.children[index]||null);
    });
    for(const [id,row]of this.rows)if(!retained.has(id)){row.remove();this.rows.delete(id);}
    this.empty.hidden=board.entries.length>0;this.empty.textContent='还没有来宾留下答题成绩。';
    if(top>0&&anchor?.isConnected)this.list.scrollTop+=anchor.getBoundingClientRect().top-box.top-offset;
    else this.list.scrollTop=0;
  }
}
