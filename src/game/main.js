import '../fonts.css';
import './style.css';
import { resolveInvitationTheme } from '../invitation-theme.js';
import { getCaptchaProof } from './captcha.js';
import { RosePetals } from '../petals.js';

document.documentElement.dataset.theme = resolveInvitationTheme(location.search);
const atmosphere=document.createElement('div');atmosphere.className='game-atmosphere';atmosphere.setAttribute('aria-hidden','true');
const petalsCanvas=document.createElement('canvas');atmosphere.append(petalsCanvas);document.body.prepend(atmosphere);
const petals=new RosePetals(petalsCanvas);petals.start().catch(()=>{petalsCanvas.dataset.state='unavailable';});
window.addEventListener('pagehide',event=>{if(!event.persisted)petals.destroy();});
const app = document.getElementById('gameApp');
const view = document.getElementById('gameContent');
const feedback = document.getElementById('gameFeedback');
const tabs = document.querySelectorAll('[data-game-tab]');
const state = { config: null, me: null, tab: 'play', busy: false, current: null, draft: '', pending: null, challenge: null, phone: '', name: '', countdown: 0, identityGeneration:0, refreshing:false, boardGeneration:0 };
try { const saved = JSON.parse(sessionStorage.getItem('wedding.game.pending') || 'null'); if (saved?.requestId && saved?.questionId) state.pending = saved; } catch { /* 存储不可用时保留当前页面内存。 */ }
const el = (tag, className = '', content = '') => { const node = document.createElement(tag); node.className = className; node.textContent = content; return node; };
const button = (label, action, className = 'game-button') => { const node = el('button', className, label); node.type = 'button'; node.onclick = action; return node; };
const id = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const savePending = () => { try { sessionStorage.setItem('wedding.game.pending', JSON.stringify(state.pending)); } catch { /* 待确认请求仍保存在页面内存。 */ } };
function reconcilePending(me) {
  if (state.pending && (state.pending.owner !== me.participant.id || me.answers.some(answer => answer.requestId === state.pending.requestId))) { state.pending=null; savePending(); }
}
const notice = message => { feedback.textContent = message; };
async function request(path, body) {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch('/api/game' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    let result; try { result=await response.json(); } catch { throw new Error('暂时无法连接，请稍后重试'); }
    if (!response.ok) { const error = new Error(result.message || '暂时无法连接，请稍后重试'); error.status = response.status; error.code = result.error; throw error; }
    return result;
  } finally { clearTimeout(timeout); }
}
function labelledInput(label, name, value, attributes = {}) {
  const wrapper = el('label', 'game-label', label), input = document.createElement('input'); input.name = name; input.value = value;
  Object.assign(input, attributes); wrapper.append(input); return wrapper;
}
function rules() {
  const details = document.createElement('details'); details.className = 'game-rules';
  details.append(el('summary', '', '参与与兑奖规则'));
  const deadline = new Date(state.config.closesAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  details.append(el('p', '', `北京时间 ${deadline} 截止。每题一次正式提交，回答由 AI 辅助判定。答对 ${state.config.requiredCorrect} 题达标，按服务端达标顺序取前 ${state.config.maxWinners} 位进入获奖名单；名单内按答对题数排序，同分按达到该成绩的时间排序。前三分别获得大奖，其余为参与奖。成绩与排名在截止和复核完成前均为暂定。现场凭后端签发的兑奖码核验，每人限领一次。`));
  return details;
}
function render() {
  tabs.forEach(tab => { tab.setAttribute('aria-selected', String(tab.dataset.gameTab === state.tab)); tab.tabIndex = tab.dataset.gameTab === state.tab ? 0 : -1; });
  view.replaceChildren();
  if (!state.config?.enabled) { view.append(el('p', 'game-empty', '默契挑战正在准备中。')); return; }
  if (state.tab === 'board') { renderBoard(); return; }
  if (!state.me) { renderLogin(); return; }
  renderPlay();
}
function renderLogin() {
  view.append(el('div', 'game-facts', `${state.config.questions.length} 道题 · ${state.config.requiredCorrect} 题达标 · ${state.config.maxWinners} 位获奖`));
  const form = document.createElement('form'); form.id = 'gameLogin';
  form.append(labelledInput('您的称呼', 'name', state.name, { maxLength: 48, autoComplete: 'nickname', required: true }));
  form.append(labelledInput('手机号', 'phone', state.phone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel-national', maxLength: 16, required: true, placeholder: '中国大陆 11 位手机号' }));
  const row = el('div', 'game-code-row');
  row.append(labelledInput('短信验证码', 'code', '', { type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, required: true }));
  const getCode = button(state.countdown > Date.now() ? `${Math.ceil((state.countdown - Date.now()) / 1000)} 秒` : '获取验证码', async () => {
    if (state.busy || state.countdown > Date.now()) return;
    if(!form.elements.consent.checked){notice('请先阅读并同意登录隐私说明。');return;}
    if(!/^(?:\+86)?1\d{10}$/.test(form.elements.phone.value.replace(/[ -]/g,''))){notice('请填写中国大陆11位手机号。');return;}
    state.phone = form.elements.phone.value; state.name = form.elements.name.value;
    state.challenge = id(); state.busy = true; getCode.disabled = true;
    let requested=false;
    try {
      const captcha=await getCaptchaProof(state.config.captchaId);requested=true;
      const result = await request('/auth/code', { phone: state.phone, requestId: state.challenge,captcha });
      state.challenge = result.challengeId; state.countdown = Date.now() + result.retryAfter * 1000;
      notice(result.delivery === 'sent' ? '验证码已发送，请查看短信。' : '发送结果待确认，请查看是否收到短信。');
    } catch (error) { notice(error.message); if(requested&&(!error.status||error.status>=500||error.status===429))state.countdown = Date.now() + 60000; }
    finally { state.busy = false; }
  }, 'game-code-button');
  getCode.id = 'getGameCode'; row.append(getCode); form.append(row);
  form.append(el('p', 'game-privacy', '手机号用于参赛与兑奖，登录有效期30天；排行榜显示您填写的称呼。'));
  const consent=el('label','game-consent'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='consent';checkbox.required=true;
  const privacy=el('a','','登录隐私说明');privacy.href='./privacy.html';privacy.target='_blank';privacy.rel='noopener';
  consent.append(checkbox,document.createTextNode('我已阅读并同意'),privacy);form.append(consent);
  const submit = el('button', 'game-button', state.config.phase === 'open' ? '开启默契挑战' : '查看我的成绩'); submit.type = 'submit'; form.append(submit);
  form.onsubmit = async event => {
    event.preventDefault(); if (state.busy) return;
    if (!state.challenge) { notice('请先获取短信验证码。'); return; }
    state.phone = form.elements.phone.value; state.name = form.elements.name.value; state.busy = true; submit.disabled = true;
    try {
      await request('/auth/verify', { phone: state.phone, name: state.name, challengeId: state.challenge, code: form.elements.code.value });
      state.identityGeneration++;
      state.me = await request('/me'); reconcilePending(state.me); notice(''); render();
    } catch (error) { notice(error.message); }
    finally { state.busy = false; submit.disabled = false; }
  };
  view.append(form, rules());
}
function renderPlay() {
  const person = state.me.participant;
  view.append(el('p', 'game-greeting', `${person.name}，欢迎来赴这场默契之约`));
  const score = el('div', 'game-score'); score.append(el('strong', '', String(person.score)), el('span', '', ` / ${state.config.questions.length} 题`)); view.append(score);
  view.append(el('p', 'game-score-caption', state.config.phase === 'settled' ? '成绩已结算' : '暂定答对 · 待复核与截止后结算'));
  if (state.me.claim) {
    const claim = el('section', 'game-claim'); claim.append(el('span', 'game-seal', '囍'), el('h2', '', state.me.claim.prize));
    claim.append(el('p', '', state.me.claim.redeemedAt ? '这份心意已经领取' : '婚礼现场，请向工作人员出示兑奖码'));
    const code = el('code', 'game-claim-code', state.me.claim.code.match(/.{1,4}/g).join('-')); claim.append(code);
    if (!state.me.claim.redeemedAt) claim.append(button('复制兑奖码', async () => { try { await navigator.clipboard.writeText(state.me.claim.code); notice('兑奖码已复制。'); } catch { notice('未能复制，可向工作人员出示上方兑奖码。'); } }, 'game-small-button'));
    view.append(claim);
  } else if (state.config.phase !== 'open') view.append(el('p', 'game-empty', state.config.phase === 'settled' ? '感谢参与，这份默契已成为婚礼的纪念。' : '答题已截止，正在等待复核与名单结算。'));
  const answered = new Map(state.me.answers.map(answer => [answer.questionId, answer]));
  const dots = el('nav', 'game-question-nav'); dots.setAttribute('aria-label', '选择题目');
  state.current ??= state.pending?.questionId || state.config.questions.find(question => !answered.has(question.id))?.id || 'q1';
  for (const [index, question] of state.config.questions.entries()) {
    const item = button(String(index + 1), () => { state.current = question.id; state.draft = ''; notice(''); render(); }, 'game-question-number');
    item.dataset.state = answered.get(question.id)?.status || 'empty'; item.setAttribute('aria-label', `第 ${index + 1} 题`); item.setAttribute('aria-current', String(state.current === question.id)); dots.append(item);
  }
  view.append(dots);
  const question = state.config.questions.find(item => item.id === state.current), answer = answered.get(state.current);
  if (question) {
    const card = el('section', 'game-question'); card.append(el('h2', '', question.title));
    if (answer) {
      card.append(el('p', 'game-my-answer', answer.text));
      card.append(el('p', 'game-answer-status', ({ correct: '这一题答对了', incorrect: '这一题未答对', review: '这一题需要复核，成绩尚未确定', pending: '回答已保存，等待判题', judging: '正在核对这份默契…' })[answer.status]));
      const next = state.config.questions.find(item => !answered.has(item.id));
      if (next && state.config.phase === 'open') card.append(button('继续下一题', () => { state.current = next.id; state.draft = ''; render(); }));
    } else if (state.config.phase === 'open') {
      const form = document.createElement('form'), textarea = document.createElement('textarea'); textarea.id = 'gameAnswer'; textarea.rows = 3; textarea.maxLength = 640; textarea.required = true; textarea.placeholder = '用你自己的话回答'; textarea.setAttribute('aria-label', '您的回答');
      textarea.value = state.pending?.questionId === question.id ? state.pending.text : state.draft;
      textarea.oninput = () => { state.draft = textarea.value; }; form.append(textarea, el('p', 'game-attempt-note', '每题一次正式提交，网络重试不重复计分。'));
      const submit = el('button', 'game-button', '提交回答'); submit.type = 'submit'; form.append(submit);
      form.onsubmit = async event => {
        event.preventDefault(); if (state.busy) return;
        const answerText = textarea.value.trim(); if ([...answerText].length > 320) { notice('回答请在 320 字内。'); return; }
        if (state.pending && (state.pending.questionId !== question.id || state.pending.text !== answerText)) { notice('上一份回答待确认，请恢复原回答后重试。'); return; }
        state.pending ??= { requestId: id(), questionId: question.id, text: answerText, configVersion: state.config.version, owner: state.me.participant.id }; savePending();
        state.busy = true; submit.disabled = true;
        try { await request('/answers', state.pending); state.pending = null; savePending(); state.draft = ''; state.me = await request('/me'); notice('回答已保存。'); render(); }
        catch (error) { if (error.status && error.status < 500) { state.pending = null; savePending(); } notice(error.status ? error.message : '提交结果待确认，请保留原回答重试。'); }
        finally { state.busy = false; submit.disabled = false; }
      };
      card.append(form);
    }
    view.append(card);
  }
  view.append(rules(), button('退出当前账号', async () => { try { state.identityGeneration++; await request('/auth/logout', {}); state.me = null; state.pending = null; savePending(); state.challenge = null; render(); } catch (error) { notice(error.message); } }, 'game-logout'));
}
async function renderBoard(background = false) {
  const generation=++state.boardGeneration;
  if (!background) view.replaceChildren(el('p', 'game-empty', '正在展开默契榜…'));
  try {
    const board = await request('/leaderboard'); if (state.tab !== 'board'||generation!==state.boardGeneration) return;
    view.replaceChildren(el('p', 'game-board-note', board.provisional ? '暂定排名 · 截止并复核后公布最终结果' : '默契榜 · 最终结果'));
    const list = el('ol', 'game-leaderboard');
    board.entries.forEach(row => { const item = el('li', ''); item.append(el('span', 'game-rank', String(row.rank).padStart(2, '0')), el('span', 'game-rank-name', row.name), el('strong', '', `${row.score} 题`)); if (row.prize) item.append(el('small', '', row.prize)); list.append(item); });
    if (!board.entries.length) view.append(el('p', 'game-empty', '默契榜等待第一份达标成绩。'));
    else view.append(list);
    view.append(button('刷新默契榜', () => renderBoard(), 'game-small-button'), rules());
  } catch (error) { if (state.tab === 'board'&&generation===state.boardGeneration) { if (background) notice('榜单刷新未完成，当前为上次读取的结果。'); else view.replaceChildren(el('p', 'game-empty', error.message), button('重新查看', () => renderBoard(), 'game-small-button')); } }
}
async function refresh() {
  if (document.hidden || state.busy || state.refreshing || !state.config?.enabled) return;
  state.refreshing=true;
  const identity=state.identityGeneration;
  try {
    const config = await request('/config'), changedConfig=config.version!==state.config.version||config.phase!==state.config.phase;
    if(identity!==state.identityGeneration)return;
    state.config = config;
    if (!config.enabled) { render(); return; }
    if (state.me) {
      const me = await request('/me'), changed = JSON.stringify(me) !== JSON.stringify(state.me);
      if(identity!==state.identityGeneration)return;
      state.me = me; reconcilePending(me);
      if ((changedConfig || changed && document.activeElement?.tagName !== 'TEXTAREA') && state.tab === 'play') render();
    }
    if(state.tab==='board') await renderBoard(true);
  } catch (error) { if (error.status === 401&&identity===state.identityGeneration) { state.me = null; render(); notice('请重新验证手机号。'); } }
  finally {state.refreshing=false;}
}
tabs.forEach(tab => { tab.onclick = () => { state.tab = tab.dataset.gameTab; notice(''); render(); }; });
let timer,refreshTimer;
function startTimers() {
  clearInterval(timer);clearInterval(refreshTimer);
  timer = setInterval(() => {
  const codeButton = document.getElementById('getGameCode');
  if (codeButton) { const seconds = Math.max(0, Math.ceil((state.countdown - Date.now()) / 1000)); codeButton.textContent = seconds ? `${seconds} 秒` : '获取验证码'; codeButton.disabled = state.busy || seconds > 0; }
}, 1000);
  refreshTimer = setInterval(refresh, 4000);
}
startTimers();
window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(refreshTimer); });
window.addEventListener('pageshow', event => { if(event.persisted){startTimers();refresh();} });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
const back = document.getElementById('backToInvitation');
const target = new URL('./', location.href); for (const key of ['theme', 'side', 'parents']) { const value = new URLSearchParams(location.search).get(key); if (value) target.searchParams.set(key, value); } back.href = target.href;
async function initialize() {
  try { state.config = await request('/config'); if (state.config.enabled) { try { state.me = await request('/me'); reconcilePending(state.me); } catch (error) { if (error.status !== 401) throw error; } } render(); }
  catch (error) { view.replaceChildren(el('p', 'game-empty', '默契小笺暂时无法打开'), button('重新打开', () => location.reload())); notice(error.message); }
  app.dataset.state = 'ready';
}
initialize();
