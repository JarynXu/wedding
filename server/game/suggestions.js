/** 接话建议是可用的帮助入口，不是题目的候选答案。 */
const suggestionIntents=new Map([['给点提示','hint'],['给几个选项','options'],['换个问法','repeat'],['看看我的成绩','score'],['我能领礼物吗？','standing'],['看看游戏规则','rules'],['继续答题','continue'],['婚礼几点开始？','wedding'],['怎么去酒店？','wedding']]);
export function suggestionIntent(label){return suggestionIntents.get(label);}

export function followUpChoices(context) {
  if(!context.deck)return ['看看我的成绩','我能领礼物吗？','婚礼几点开始？','怎么去酒店？'];
  if(context.scene==='pause')return ['继续答题','看看游戏规则'];
  const help=context.deck.hints?.length?'给点提示':'换个问法';
  const options=context.deck.choices?.length===4?'给几个选项':'看看我的成绩';
  return [...new Set([...(context.scene==='options'?[help,'看看我的成绩']:[help,options]),'换个问法','看看我的成绩','我能领礼物吗？','看看游戏规则'])];
}

export function suggestedReplies(context, proposed=[]) {
  const available=followUpChoices(context);
  const valid=proposed.filter(value=>typeof value==='string'&&value.trim()&&value.length<=24&&!/[<>{}]|https?:|提示词|系统指令|修改成绩|直接发奖|我选|我猜|答案是|跳过|放弃这题|随便聊|慢慢聊/.test(value)
    &&!context.deck?.choices?.some(choice=>value.includes(choice))
    &&(context.deck||!/下一题|继续答|继续猜|给.{0,4}(?:提示|选项)|换.{0,4}问法/.test(value)));
  return [...new Set([...valid,...available])].slice(0,2);
}

export function announcesAnswerResult(value) {
  return !value.includes('{{score}}')&&/答[对错中][啦了]|猜[对中错][啦了！!。，,]|没猜中|这一分|(?:已经|又|获得|拿到).{0,6}(?:加分|得分|一分)|(?:分数|得分).{0,6}(?:增加|上涨|加上|往上)/.test(value);
}
