import { publicGameRules } from '../game-rules.js';
export function gameRules(config) {
  const content=document.createElement('div');content.className='game-rules-document';
  const section=(title,paragraphs)=>{const h=document.createElement('h3');h.textContent=title;content.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;content.append(p);}};
  for(const item of publicGameRules(config)) section(item.title,item.paragraphs);
  return content;
}

export function gameIntroduction(config) {
  const content=document.createElement('div');content.className='game-introduction';
  const lead=document.createElement('div');lead.className='game-introduction-lead';
  const greeting=document.createElement('p');greeting.textContent=config.phase==='open'?'婚礼前，来玩个小游戏吧。':'答题已经结束，喜宴司仪还在这里。';lead.append(greeting);content.append(lead);
  const section=({title,paragraphs})=>{const h=document.createElement('h3');h.textContent=title;content.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;content.append(p);}};
  const [play,prizes,timing,phone]=publicGameRules(config);
  if(config.phase==='open'){
    section({...play,paragraphs:[play.paragraphs[0]]});
    section(prizes);
  }else{
    section({title:'还能做些什么',paragraphs:['可以看看自己的成绩和奖品，也可以问喜宴司仪婚礼的时间、地点和现场安排。']});
  }
  section(timing);
  const note=document.createElement('p');note.className='game-introduction-note';note.textContent=phone.paragraphs[0];content.append(note);
  return content;
}
