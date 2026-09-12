export class GameError extends Error {
  constructor(code, message, status = 400, retryAfter = 0) { super(message); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export function initialGameConfig() {
  return { prizePolicy:'perfect-six-v1', closesAt: '2026-10-16T16:00:00.000Z', participationLimit: 20, requiredCorrect: 2,
    questions: Array.from({ length: 6 }, (_, index) => ({ id: `q${index + 1}`, title: '', answer: '', aliases: [], rubric: '' })),
    prizes: { first: '一等奖', second: '二等奖', third: '三等奖', participation: '小玩偶' }, judgeInstructions: '' };
}
export function text(value, label, maximum, allowEmpty = false) {
  if (typeof value !== 'string') throw new GameError('INVALID_INPUT', `${label}须为文字`);
  const clean = value.normalize('NFC').trim();
  if ((!allowEmpty && !clean) || [...clean].length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) throw new GameError('INVALID_INPUT', `${label}请填写${allowEmpty ? '不超过' : '1–'}${maximum}字`);
  return clean;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) throw new GameError('INVALID_ID', '请求标识无效，请重试');
  return value;
}
export function phoneNumber(value) {
  const phone = text(value, '手机号', 24).replace(/[ -]/g, '').replace(/^\+86/, '');
  if (!/^1\d{10}$/.test(phone)) throw new GameError('INVALID_PHONE', '请填写中国大陆 11 位手机号');
  return '+86' + phone;
}
export function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new GameError('INVALID_INPUT', `${label}须为 ${min}–${max} 的整数`);
  return value;
}
export function validateGameConfig(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.questions) || input.questions.length !== 6) throw new GameError('INVALID_CONFIG', '请配置六道题');
  if (typeof input.closesAt !== 'string' || !/T.+(?:Z|[+-]\d{2}:\d{2})$/.test(input.closesAt) || !Number.isFinite(Date.parse(input.closesAt))) throw new GameError('INVALID_CONFIG', '截止时间须包含时区');
  const questions = input.questions.map((question, index) => {
    if (!question || question.id !== `q${index + 1}` || !Array.isArray(question.aliases) || question.aliases.length > 20) throw new GameError('INVALID_CONFIG', '题目编号或别称格式有误');
    return { id: question.id, title: text(question.title, '题目', 240, true), answer: text(question.answer, '标准答案', 800, true), aliases: question.aliases.map(alias => text(alias, '答案别称', 200)), rubric: text(question.rubric, '评分依据', 1600, true) };
  });
  const prizes = Object.fromEntries(['first', 'second', 'third', 'participation'].map(key => [key, text(input.prizes?.[key], '奖品名称', 60)]));
  return { prizePolicy:'perfect-six-v1', closesAt: new Date(input.closesAt).toISOString(), participationLimit: integer(input.participationLimit ?? input.maxWinners, '参与奖名额', 0, 500), requiredCorrect: integer(input.requiredCorrect, '达标题数', 1, 6), questions, prizes, judgeInstructions: text(input.judgeInstructions, '判题补充说明', 4000, true) };
}
export function gamePhase(event, now = Date.now()) {
  if (event.settled_at) return 'settled';
  if (!event.published) return 'draft';
  return Date.parse(event.config.closesAt) <= now ? 'closed' : 'open';
}
const compareId = (a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
const compareArrival = (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime() || compareId(a.id, b.id);

/** 前三取全体最早六题全对者；参与奖取其余最早达标者，奖位与实时名次分开。 */
export function rankGame(participants, answers, config) {
  const grouped = new Map();
  for (const answer of answers) {
    if (new Date(answer.received_at).getTime() >= Date.parse(config.closesAt)) continue;
    const list = grouped.get(answer.participant_id) || []; list.push(answer); grouped.set(answer.participant_id, list);
  }
  const standings = participants.map(participant => {
    const all = grouped.get(participant.id) || [];
    const correct = all.filter(answer => answer.status === 'correct').sort(compareArrival);
    const qualifying = correct[config.requiredCorrect - 1], completed = correct[config.questions.length - 1];
    return { ...participant, score: correct.length, answered: all.length, pending: all.filter(answer => ['pending', 'judging', 'review'].includes(answer.status)).length, qualifiedAt: qualifying?.received_at || null, qualifying, completed, reached: correct.at(-1) };
  });
  const ordered = [...standings].filter(row=>row.answered).sort((a,b)=>b.score-a.score || (a.reached&&b.reached?compareArrival(a.reached,b.reached):new Date(a.created_at)-new Date(b.created_at)||a.id.localeCompare(b.id)));
  ordered.forEach((row,index)=>{row.rank=index+1;});
  const eligible = standings.filter(row=>row.qualifying).sort((a,b)=>compareArrival(a.qualifying,b.qualifying));
  eligible.forEach((row,index)=>{row.qualificationOrder=index+1;});
  const podium = standings.filter(row=>row.completed).sort((a,b)=>compareArrival(a.completed,b.completed)).slice(0,3);
  podium.forEach((row,index)=>{row.podiumPlace=index+1;});
  const participation = eligible.filter(row=>!podium.includes(row)).slice(0,config.participationLimit ?? config.maxWinners);
  const candidates = [...podium.map((row,index)=>({...row,slot:index+1,award:'podium',prize:config.prizes[['first','second','third'][index]]})),...participation.map((row,index)=>({...row,slot:index+4,award:'participation',prize:config.prizes.participation}))];
  return { standings, ordered, candidates };
}

export function parseVerdict(value, answer) {
  if (!value || !['correct', 'incorrect', 'review'].includes(value.verdict) || typeof value.reason !== 'string' || typeof value.evidence !== 'string') throw new GameError('INVALID_VERDICT', '判题返回格式无效', 502);
  const reason = text(value.reason, '判题依据', 400, true), evidence = text(value.evidence, '答案引文', 320, true);
  if ((value.verdict === 'correct' && !evidence) || (evidence && !answer.includes(evidence))) throw new GameError('INVALID_EVIDENCE', '判题未提供可核对的回答依据', 502);
  return { verdict: value.verdict, reason, evidence };
}
export function needsInjectionReview(answer) {
  return /(?:忽略.{0,12}(?:指令|规则|提示|要求)|(?:系统|开发者)(?:消息|指令|提示词)|给我(?:满分|发奖)|(?:system|developer)\s*:|ignore.{0,20}(?:instructions|rules)|<\|im_start|"verdict"\s*:)/iu.test(answer);
}
