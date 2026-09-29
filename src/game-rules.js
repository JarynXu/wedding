function prizeRules(config) {
  const { prizes, participationLimit, requiredCorrect } = config;
  const podium = `最先答对全部 ${config.questions.length} 题的三位来宾，按完成顺序，分别获得${prizes.first}、${prizes.second}和${prizes.third}。`;
  const participation = participationLimit > 0
    ? `另有 ${participationLimit} 份${prizes.participation}，按答对 ${requiredCorrect} 题的先后顺序送出。前三名不占这些名额，每人只领一份奖品。`
    : '本场只设这三个奖位，每人只领一份奖品。';
  return [podium, participation];
}

/** 页面和喜宴司仪共享公开规则；返回值不含题目、答案或评分说明。 */
export function publicGameRules(config) {
  const deadline = gameDeadline(config.closesAt);
  const timing = config.phase === 'settled'
    ? `答题已于 ${deadline} 结束，获奖名单已经公布，可以到默契榜查看。`
    : config.phase === 'closed'
      ? `答题已于 ${deadline} 结束，获奖名单确认后会显示在默契榜。`
      : `答题截止到 ${deadline}。截止后会公布获奖名单，答题期间的排名还会变化。`;
  return [
    { title: '怎么玩', paragraphs: [`一共 ${config.questions.length} 道题，每题只能答一次。和喜宴司仪聊着答就行，想不起来可以要提示或选项。`, '点选选项或发送答案后就算提交，不能重答。聊天、查成绩和要提示都不算作答；说“跳过”会进入下一题，这题不计分。'] },
    { title: '奖品怎么送', paragraphs: prizeRules(config) },
    { title: '时间和领奖', paragraphs: [timing, '获奖后，婚礼当天在领奖环节出示聊天里的领礼凭证，就能领取礼物。'] },
    { title: '为什么要手机号', paragraphs: ['手机号用来保存答题进度，领奖时也方便核对。榜单和祝福簿会显示你填写的称呼，不会显示手机号。'] },
  ];
}

export function gameDeadline(value) {
  const date=new Date(value),formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
  const midnight=parts.hour==='00'&&parts.minute==='00'&&parts.second==='00';
  const day=midnight?Object.fromEntries(formatter.formatToParts(new Date(date.getTime()-1000)).map(part=>[part.type,part.value])):parts;
  return `${day.year}年${day.month}月${day.day}日 ${midnight?'24:00':parts.hour+':'+parts.minute+(parts.second==='00'?'':':'+parts.second)}`;
}

/** 开场与规则页使用相同的奖品条件。 */
export function gameOpeningInvitation(config) {
  return `${config.questions.length} 道题，来试试你和新人的默契吧！${prizeRules(config).join('')}获奖后，婚礼当天凭聊天里的领礼凭证来领奖。`;
}
