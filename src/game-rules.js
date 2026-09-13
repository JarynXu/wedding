/** 页面和主持人共享公开规则；返回值不含题目、答案或评分说明。 */
export function publicGameRules(config) {
  const deadline = new Date(config.closesAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return [
    { title: '来聊一场默契', paragraphs: [`主持人准备了 ${config.questions.length} 个关于新人的小问题。你可以回答，也可以问成绩、要提示，或请主持人换个问法。`, '聊天和要提示不占答题机会。每个问题只记一次答案，明确跳过也记一次。想好了再告诉主持人。'] },
    { title: '把小礼物带回家', paragraphs: [`北京时间 ${deadline} 前，答对 ${config.requiredCorrect} 题即可达标。前 ${config.participationLimit} 位达标且未获前三名的来宾领取参与奖。`, `前三名向全体来宾开放，必须答对全部六题，按六题全对的完成时间排序。前三名分别获得${config.prizes.first}（大号毛绒玩偶）、${config.prizes.second}（中号毛绒玩偶）、${config.prizes.third}（小号毛绒玩偶）；另有 ${config.participationLimit} 份${config.prizes.participation}（钥匙扣小玩偶）作为参与奖，每人只领取一个奖项。`, '奖品图片为玩偶图示，现场以实物为准。'] },
    { title: '婚礼当天见', paragraphs: ['活动结束后会公布最终名单。获奖来宾可在聊天中查看领礼凭证，婚礼当天向工作人员出示手机核对领取，每人限领一次。'] },
    { title: '记住你的心意', paragraphs: ['手机号用于记住你的进度和现场领奖，不会展示给其他来宾。', '榜单和祝福簿会显示你的称呼。如需更正或删除参与记录，请联系新人。'] },
  ];
}

/** 开场只介绍达标、名额和现场领奖，数字与奖品名称来自活动配置。 */
export function gameOpeningInvitation(config) {
  return `${config.questions.length} 个小问题，答对 ${config.requiredCorrect} 题就达标！全体来宾都能争前三，比谁先六题全对；另有 ${config.participationLimit} 份${config.prizes.participation}，给最先达标且未获前三名的来宾。婚礼当天，凭领礼凭证来领奖。`;
}
