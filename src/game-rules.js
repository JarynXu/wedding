/** 页面和主持人共享公开规则；返回值不含题目、答案或评分说明。 */
export function publicGameRules(config) {
  const deadline = new Date(config.closesAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return [
    { title: '来聊一场默契', paragraphs: [`主持人准备了 ${config.questions.length} 个关于新人的小问题。你可以回答，也可以问成绩、要提示，或请主持人换个问法。`, '聊天和要提示不占答题机会。每个问题只记一次答案，明确跳过也记一次。想好了再告诉主持人。'] },
    { title: '把小礼物带回家', paragraphs: [`北京时间 ${deadline} 前，答对 ${config.requiredCorrect} 题即可达标。前 ${config.maxWinners} 位达标的来宾进入获奖名单。`, `名单中按答对题数排名，同分时先达到该成绩的人在前。前三名分别获得${config.prizes.first}、${config.prizes.second}、${config.prizes.third}，其余获奖来宾领取${config.prizes.participation}。`] },
    { title: '婚礼当天见', paragraphs: ['活动结束后会公布最终名单。获奖来宾可在聊天中查看领礼凭证，婚礼当天向工作人员出示手机核对领取，每人限领一次。'] },
    { title: '记住你的心意', paragraphs: ['手机号用于记住你的进度和现场领奖，不会展示给其他来宾。这台设备会为你保留30天登录，退出或换设备后需要重新验证。', '榜单和祝福簿会显示你的称呼。如需更正或删除参与记录，请联系新人。'] },
  ];
}
