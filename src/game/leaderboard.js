const node=(tag,className,text='')=>{const element=document.createElement(tag);element.className=className;element.textContent=text;return element;};

/** 实时榜单复用行节点，更新排序时保留来宾正在阅读的位置。 */
export class LeaderboardView {
  constructor() {
    this.root=node('section','leaderboard-room');this.root.setAttribute('aria-label','默契榜');
    this.empty=node('p','game-empty','正在展开默契榜…');this.list=node('ol','game-leaderboard');this.list.tabIndex=0;
    this.root.append(this.empty,this.list);this.rows=new Map();
  }
  update(board) {
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
        if(entry.prize)row.append(node('small','',entry.prize));
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
