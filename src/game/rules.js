import { publicGameRules,gameDeadline } from '../game-rules.js';
import { prizeArt } from './prizes.js';
export function gameRules(config) {
  const content=document.createElement('div');content.className='game-rules-document';
  const section=(title,paragraphs)=>{const h=document.createElement('h3');h.textContent=title;content.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;content.append(p);}};
  for(const item of publicGameRules(config)) section(item.title,item.paragraphs);
  const link=document.createElement('a');link.href='./privacy.html';link.target='_blank';link.rel='noopener';link.textContent='参与说明';content.append(link);
  return content;
}

export function gameIntroduction(config) {
  const content=document.createElement('div');content.className='game-introduction';
  const lead=document.createElement('div');lead.className='game-introduction-lead';
  const greeting=document.createElement('p');greeting.textContent=config.phase==='open'?'婚礼前，来玩个小游戏吧。':'答题已经结束，喜宴司仪还在这里。';lead.append(prizeArt('keychain'),greeting);content.append(lead);
  const section=(title,text)=>{const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;content.append(h,p);};
  if(config.phase==='open'){
  section('聊着答题',`共 ${config.questions.length} 题，每题答一次。想不起来，可以向喜宴司仪要提示或选项。`);
  section('答题赢玩偶',`答对 ${config.requiredCorrect} 题，就有机会获得钥匙扣小玩偶。共 ${config.participationLimit} 份，按达标先后送出。全部 ${config.questions.length} 题答对的前三位，分别领大、中、小号毛绒玩偶，不占这 ${config.participationLimit} 份名额。每人领一份。`);
  section('婚礼现场领取',`${gameDeadline(config.closesAt)} 截止。获奖后，在婚礼的领奖环节出示手机里的凭证。`);
  }else{
    section('还有什么想问的', '可以看看你的答题成绩和奖品，也可以问喜宴司仪婚礼的时间、地点与现场安排。');
    section('婚礼现场领取', '获奖名单公布后，出示聊天里的领礼凭证，就能在婚礼的领奖环节领取礼物。');
  }
  const note=document.createElement('p');note.className='game-introduction-note';note.textContent='参加时需要验证手机号，用来记住答题进度和核对领奖，号码不会公开。';content.append(note);
  return content;
}
