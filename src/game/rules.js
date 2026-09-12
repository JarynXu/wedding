import { publicGameRules } from '../game-rules.js';
export function gameRules(config) {
  const content=document.createElement('div');content.className='game-rules-document';
  const section=(title,paragraphs)=>{const h=document.createElement('h3');h.textContent=title;content.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;content.append(p);}};
  for(const item of publicGameRules(config)) section(item.title,item.paragraphs);
  const link=document.createElement('a');link.href='./privacy.html';link.target='_blank';link.rel='noopener';link.textContent='参与说明';content.append(link);
  return content;
}
