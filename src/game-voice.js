// 公开的展示文案，不包含题目答案或评分依据。
export function questionGreeting(index = 0) {
  return ['先来热个场，看看你有多了解这对新人～', '下一份默契来了，准备好接招了吗？', '把记忆里的小线索找出来吧～', '婚礼情报站继续营业，这题交给你！', '离终点又近一步，继续试试你的默契吧。', '最后一题啦，为这场小挑战画个句号吧～'][index % 6];
}
export function answerReply(status) {
  return ({ correct: '答对啦！这份默契接住了。', incorrect: '这一题还没答中，心意已经收到啦。', review: '这一题我还拿不准，留给新人核对一下。你的回答已经记下啦。', pending: '收到啦，稍等我一下～', judging: '正在想一想…' })[status] || '这份回答已经记下啦。';
}
