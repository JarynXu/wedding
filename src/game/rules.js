export function gameRules(config) {
  const content=document.createElement('div');content.className='game-rules-document';
  const section=(title,paragraphs)=>{const h=document.createElement('h3');h.textContent=title;content.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;content.append(p);}};
  section('怎么玩', [`共 ${config.questions.length} 道题，答对 ${config.requiredCorrect} 题达标。请围绕题目作答，每题有一次正式提交机会，网络重试不重复计分。`, '回答后，小助手会核对这份默契。拿不准的回答留给新人复核，题目答案不会在对话中公布。']);
  const deadline=new Date(config.closesAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  section('截止时间与名额', [`北京时间 ${deadline} 截止，最多 ${config.maxWinners} 位获奖。按达标的服务端接收顺序取前 ${config.maxWinners} 位，再在名单内按答对题数排名；同分时，先达到该成绩的人在前。`, '榜单和成绩在截止、复核与结算完成前均为暂定。']);
  section('婚礼现场兑奖', [`前三名奖品分别为：${config.prizes.first}、${config.prizes.second}、${config.prizes.third}。其余获奖来宾领取${config.prizes.participation}。`, '结算后，获奖者可在本页查看兑奖码。婚礼现场向工作人员出示手机，核对后领取，每人限领一次。']);
  section('登录与称呼', ['同一手机号对应同一份答题记录。登录在同一浏览器内有效期为 30 天；退出、清除 Cookie 或更换浏览器后需要重新验证。', '称呼会与祝福面板共用，注册成功后的称呼作为后续默认值。排行榜显示称呼，不公开手机号。']);
  section('手机号与隐私', ['手机号用于登录验证与游戏兑奖，加密保存在服务端。阿里云提供短信及图形验证；AI 判题只接收题目与作答，不接收手机号。', '如需更正或删除参与资料，请联系新人。']);
  const link=document.createElement('a');link.href='./privacy.html';link.target='_blank';link.rel='noopener';link.textContent='查看完整登录隐私说明';content.append(link);
  return content;
}
