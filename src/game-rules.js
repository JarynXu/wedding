/** 页面和喜宴司仪共享公开规则；返回值不含题目、答案或评分说明。 */
export function publicGameRules(config) {
  const deadline = gameDeadline(config.closesAt),prizes=config.prizes;
  return [
    { title: '怎么玩', paragraphs: [`一共 ${config.questions.length} 道关于新人的题，和喜宴司仪聊着答就行。想不起来，可以要提示，也可以请它给几个选项。`, '每题答一次，选好再提交。聊天、查成绩和要提示都不算作答；不想答的题可以说“跳过”。'] },
    { title: '奖品怎么送', paragraphs: [`全部 ${config.questions.length} 题答对的前三位，按全对的先后顺序，分别获得${prizes.first}（大号毛绒玩偶）、${prizes.second}（中号毛绒玩偶）、${prizes.third}（小号毛绒玩偶）。`, `除前三名外，最早答对 ${config.requiredCorrect} 题的 ${config.participationLimit} 位亲友，每人一份${prizes.participation}（钥匙扣小玩偶）。前三名不占这 ${config.participationLimit} 份名额，每人只领一份。`] },
    { title: '时间与领奖', paragraphs: [`答题在 ${deadline} 截止，之后公布获奖名单。答题期间的名次会随大家的成绩变化。`, '婚礼当天的领奖环节，出示聊天里的领礼凭证就可以啦。我们现场见！'] },
    { title: '关于手机号', paragraphs: ['参加游戏需要验证手机号，用来保存答题进度和核对领奖。手机号不会公开，榜单和祝福簿显示你的称呼。'] },
  ];
}

export function gameDeadline(value) {
  const date=new Date(value),formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
  const midnight=parts.hour==='00'&&parts.minute==='00'&&parts.second==='00';
  const day=midnight?Object.fromEntries(formatter.formatToParts(new Date(date.getTime()-1000)).map(part=>[part.type,part.value])):parts;
  return `${day.year}年${day.month}月${day.day}日 ${midnight?'24:00':parts.hour+':'+parts.minute+(parts.second==='00'?'':':'+parts.second)}`;
}

/** 开场只介绍达标、名额和现场领奖，数字与奖品名称来自活动配置。 */
export function gameOpeningInvitation(config) {
  return `${config.questions.length} 个小问题，答对 ${config.requiredCorrect} 题就达标！全体来宾都能争前三，比谁先六题全对；另有 ${config.participationLimit} 份${config.prizes.participation}，给最先达标且未获前三名的来宾。婚礼当天，凭领礼凭证来领奖。`;
}
