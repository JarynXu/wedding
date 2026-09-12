import '../fonts.css';
import './style.css';
import '../glass.css';
import { InvitationDialogs } from '../dialog.js';
import { guestName, rememberRegisteredGuest } from '../guest-name.js';
import { questionGreeting, answerReply } from '../game-voice.js';
import { gameRules } from './rules.js';
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
const dialogs = new InvitationDialogs();
const tabs = document.querySelectorAll('[data-game-tab]');
const state = { config: null, me: null, tab: 'play', busy: false, current: null, draft: '', pending: null, challenge: null, phone: '', name: guestName(), consent: false, countdown: 0, identityGeneration:0, refreshing:false, boardGeneration:0 };
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
const notice = message => { if (message) return dialogs.alert(message); };
const showRules = () => { if(state.config?.enabled)return dialogs.show({title:'参与与兑奖规则',content:gameRules(state.config),kind:'rules'}); };
document.getElementById('showGameRules').onclick=showRules;
async function request(path, body) {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch('/api/game' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    let result; try { result=await response.json(); } catch { throw new Error('暂时无法连接，请稍后重试'); }
    if (!response.ok) { const error = new Error(result.message || '暂时无法连接，请稍后重试'); error.status = response.status; error.code = result.error; throw error; }
    return result;
  } catch(error) { if(error.status)throw error;throw new Error('连接暂时未完成，请稍后再试。'); } finally { clearTimeout(timeout); }
}
function labelledInput(label, name, value, attributes = {}) {
  const wrapper = el('label', 'game-label', label), input = document.createElement('input'); input.name = name; input.value = value;
  Object.assign(input, attributes); wrapper.append(input); return wrapper;
}
function render() {
  tabs.forEach(tab => { tab.setAttribute('aria-pressed', String(tab.dataset.gameTab === state.tab)); tab.hidden = tab.dataset.gameTab === 'play' && state.tab !== 'board'; });
  document.getElementById('showGameRules').disabled=!state.config?.enabled;
  view.replaceChildren();
  if (!state.config?.enabled) { view.append(el('p', 'game-empty', '默契挑战正在准备中。')); return; }
  if (state.tab === 'board') { renderBoard(); return; }
  if (!state.me) { renderLogin(); return; }
  renderPlay();
}
function renderLogin() {
  const form = document.createElement('form'); form.id = 'gameLogin'; form.noValidate=true;
  const nameField=labelledInput('您的称呼', 'name', state.name, { maxLength:48, autoComplete:'nickname' });
  if(state.name){
    nameField.hidden=true;
    const known=el('div','game-known-name');known.append(el('span','',`以 ${state.name} 参与`),button('修改',()=>{known.hidden=true;nameField.hidden=false;form.elements.name.focus();},'game-text-button'));form.append(known);
  }
  form.append(nameField);
  form.append(labelledInput('手机号', 'phone', state.phone, {type:'tel',inputMode:'tel',autoComplete:'tel-national',maxLength:16,placeholder:'11位手机号，用于游戏兑奖'}));
  const row=el('div','game-code-row');
  row.append(labelledInput('短信验证码','code','',{type:'text',inputMode:'numeric',autoComplete:'one-time-code',maxLength:6,placeholder:'输入验证码'}));
  const ensureConsent=async()=>{
    if(form.elements.consent.checked)return true;
    const agreed=await dialogs.show({title:'先确认一下登录说明',content:'手机号用于验证身份与婚礼现场兑奖，登录在同一浏览器内有效期为30天。阿里云提供短信和图形验证，排行榜不公开手机号。是否同意并继续？',confirmText:'同意并继续',cancelText:'暂不同意',kind:'consent'});
    if(agreed){form.elements.consent.checked=true;state.consent=true;}
    return agreed;
  };
  const getCode=button('获取验证码',async()=>{
    if(state.busy||state.countdown>Date.now())return;
    state.busy=true;getCode.disabled=true;
    let requested=false;
    try {
      if(!await ensureConsent())return;
      if(!/^(?:\+86)?1\d{10}$/.test(form.elements.phone.value.replace(/[ -]/g,''))){await notice('请填写11位手机号，用于游戏兑奖。');form.elements.phone.focus();return;}
      state.phone=form.elements.phone.value;state.name=form.elements.name.value;state.challenge=id();
      const captcha=await getCaptchaProof(state.config.captchaId);requested=true;
      const result=await request('/auth/code',{phone:state.phone,requestId:state.challenge,captcha});
      state.challenge=result.challengeId;state.countdown=Date.now()+result.retryAfter*1000;
      form.elements.code.placeholder='验证码已发送';form.elements.code.focus();
      if(result.delivery!=='sent')await notice('发送结果待确认，请查看是否收到短信。');
    }catch(error){notice(error.message);if(requested&&(!error.status||error.status>=500||error.status===429))state.countdown=Date.now()+60000;}
    finally{state.busy=false;getCode.disabled=state.countdown>Date.now();}
  },'game-code-button');getCode.id='getGameCode';row.append(getCode);form.append(row);
  const consent=el('label','game-consent'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='consent';checkbox.checked=state.consent;checkbox.onchange=()=>{state.consent=checkbox.checked;};
  consent.append(checkbox,document.createTextNode('我已阅读并同意'));
  const privacy=button('登录说明',showRules,'game-text-button');consent.append(privacy);form.append(consent);
  const submit=el('button','game-button',state.config.phase==='open'?'开启默契挑战':'查看我的成绩');submit.type='submit';form.append(submit);
  form.oninput=()=>{state.phone=form.elements.phone.value;state.name=form.elements.name.value;};
  form.onsubmit=async event=>{
    event.preventDefault();if(state.busy)return;
    state.busy=true;submit.disabled=true;
    try {
      if(!await ensureConsent())return;
      if(!state.challenge){await notice('请先获取短信验证码。');return;}
      if(!state.name.trim()||[...state.name.trim()].length>24){await notice('请填写24字以内的称呼。');nameField.hidden=false;form.elements.name.focus();return;}
      if(!/^\d{6}$/.test(form.elements.code.value)){await notice('请填写六位短信验证码。');form.elements.code.focus();return;}
      await request('/auth/verify',{phone:state.phone,name:state.name,challengeId:state.challenge,code:form.elements.code.value});
      state.identityGeneration++;state.me=await request('/me');rememberRegisteredGuest(state.me.participant);reconcilePending(state.me);render();
    }catch(error){notice(error.message);}finally{state.busy=false;submit.disabled=false;}
  };
  view.append(form);
}
function renderPlay() {
  const person = state.me.participant;
  const summary=el('div','game-summary');summary.append(el('span','',person.name));view.append(summary);
  const score = el('div', 'game-score'); score.append(el('strong', '', String(person.score)), el('span', '', ` / ${state.config.questions.length} 题`)); summary.append(score);
  score.append(el('small','',state.config.phase==='settled'?'答对':'暂定答对'));
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
    const changedQuestion=state.renderedQuestion!==question.id;
    const card=el('section','game-question');
    const hostQuestion=el('div','game-chat-bubble game-chat-host');hostQuestion.classList.toggle('is-new',changedQuestion);hostQuestion.append(el('span','game-chat-speaker','喜悦小助手'),el('p','game-chat-opening',question.opening||questionGreeting(state.config.questions.indexOf(question))),el('p','game-chat-question',question.title));card.append(hostQuestion);
    if (answer) {
      const mine=el('p','game-my-answer game-chat-bubble game-chat-guest',answer.text);mine.classList.toggle('is-new',changedQuestion||state.renderedAnswer!==answer.id);card.append(mine);
      const response=el('div','game-chat-bubble game-chat-host game-chat-response');
      const working=['pending','judging'].includes(answer.status);
      const stageText=({thinking:'正在想一想…',checking:'正在核对答案…',replying:'正在组织回复…'})[answer.progress]||'收到啦，稍等我一下～';
      response.append(el('span','game-chat-speaker','喜悦小助手'),el('p','game-answer-status',working?stageText:(answer.reply||answerReply(answer.status))));
      response.setAttribute('role','status');response.dataset.status=answer.status;
      const responseVersion=`${answer.id}:${answer.version}:${answer.status}:${answer.progress}`;response.classList.toggle('is-new',changedQuestion||state.renderedResponse!==responseVersion);state.renderedResponse=responseVersion;state.renderedAnswer=answer.id;
      if(working){const dots=el('span','game-typing');dots.setAttribute('aria-hidden','true');dots.innerHTML='<i></i><i></i><i></i>';response.append(dots);}
      else response.append(el('small','game-verdict',({correct:'这一题答对了',incorrect:'这一题未答对',review:'等待新人复核'})[answer.status]));
      card.append(response);
      const next = state.config.questions.find(item => !answered.has(item.id));
      if (next && state.config.phase === 'open') card.append(button('继续下一题', () => { state.current = next.id; state.draft = ''; render(); }));
    } else if (state.config.phase === 'open') {
      const form = document.createElement('form'); form.noValidate=true; form.className='game-chat-compose'; const textarea = document.createElement('textarea'); textarea.id = 'gameAnswer'; textarea.rows = 3; textarea.maxLength = 640; textarea.required = true; textarea.placeholder = '把你想到的告诉我吧…'; textarea.setAttribute('aria-label', '您的回答');
      textarea.value = state.pending?.questionId === question.id ? state.pending.text : state.draft;
      textarea.oninput = () => { state.draft = textarea.value; }; form.append(textarea);
      const submit = el('button', 'game-button', '发送回答'); submit.type = 'submit'; form.append(submit);
      form.onsubmit = async event => {
        event.preventDefault(); if (state.busy) return;
        const answerText = textarea.value.trim(); if (!answerText || [...answerText].length > 320) { notice('请写下你的回答，控制在320字以内。'); return; }
        if (state.pending && (state.pending.questionId !== question.id || state.pending.text !== answerText)) { notice('上一份回答待确认，请恢复原回答后重试。'); return; }
        state.pending ??= { requestId: id(), questionId: question.id, text: answerText, configVersion: state.config.version, owner: state.me.participant.id }; savePending();
        state.busy = true; submit.disabled = true;
        try { await request('/answers', state.pending); state.pending = null; savePending(); state.draft = ''; state.me = await request('/me'); render(); }
        catch (error) { if (error.status && error.status < 500) { state.pending = null; savePending(); } notice(error.status ? error.message : '提交结果待确认，请保留原回答重试。'); }
        finally { state.busy = false; submit.disabled = false; }
      };
      card.append(form);
    }
    view.append(card);
    state.renderedQuestion=question.id;
  }
  view.append(button('退出当前账号', async () => { try { state.identityGeneration++; await request('/auth/logout', {}); state.me = null; state.pending = null; savePending(); state.challenge = null; render(); } catch (error) { notice(error.message); } }, 'game-logout'));
}
async function renderBoard(background = false) {
  const generation=++state.boardGeneration;
  if (!background) view.replaceChildren(el('p', 'game-empty', '正在展开默契榜…'));
  try {
    const board = await request('/leaderboard'); if (state.tab !== 'board'||generation!==state.boardGeneration) return;
    state.boardErrorShown=false;
    view.replaceChildren(el('p', 'game-board-note', board.provisional ? '暂定排名 · 截止并复核后公布最终结果' : '默契榜 · 最终结果'));
    const list = el('ol', 'game-leaderboard');
    board.entries.forEach(row => { const item = el('li', ''); item.append(el('span', 'game-rank', String(row.rank).padStart(2, '0')), el('span', 'game-rank-name', row.name), el('strong', '', `${row.score} 题`)); if (row.prize) item.append(el('small', '', row.prize)); list.append(item); });
    if (!board.entries.length) view.append(el('p', 'game-empty', '默契榜等待第一份达标成绩。'));
    else view.append(list);
    view.append(button('刷新默契榜', () => renderBoard(), 'game-small-button'));
  } catch (error) { if (state.tab === 'board'&&generation===state.boardGeneration) {
    if(!background)view.replaceChildren(el('p','game-empty','默契榜暂时未展开'),button('重新查看',()=>renderBoard(),'game-small-button'));
    else {const note=view.querySelector('.game-board-note');if(note)note.textContent='上次读取的排名 · 尚未更新';}
    if(!background||!state.boardErrorShown){state.boardErrorShown=true;notice(error.message);}
  } }
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
      state.me = me; rememberRegisteredGuest(me.participant); reconcilePending(me);
      if ((changedConfig || changed && document.activeElement?.tagName !== 'TEXTAREA') && state.tab === 'play') render();
    }
    if(state.tab==='board') await renderBoard(true);
    state.pollErrorShown=false;
  } catch (error) { if (error.status === 401&&identity===state.identityGeneration) { state.me = null; render(); notice('请重新验证手机号。'); } else if(!state.pollErrorShown){state.pollErrorShown=true;notice(error.message);} }
  finally {state.refreshing=false;state.lastRefresh=Date.now();}
}
tabs.forEach(tab => { tab.onclick = () => { state.tab = tab.dataset.gameTab; notice(''); render(); }; });
let timer,refreshTimer;
function startTimers() {
  clearInterval(timer);clearInterval(refreshTimer);
  timer = setInterval(() => {
  const codeButton = document.getElementById('getGameCode');
  if (codeButton) { const seconds = Math.max(0, Math.ceil((state.countdown - Date.now()) / 1000)); codeButton.textContent = seconds ? `${seconds} 秒` : '获取验证码'; codeButton.disabled = state.busy || seconds > 0; }
}, 1000);
  refreshTimer = setInterval(()=>{if(state.me?.answers.some(answer=>['pending','judging'].includes(answer.status))||Date.now()-(state.lastRefresh||0)>4000)refresh();},800);
}
startTimers();
window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(refreshTimer); });
window.addEventListener('pageshow', event => { if(event.persisted){startTimers();refresh();} });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
const back = document.getElementById('backToInvitation');
const target = new URL('./', location.href); for (const key of ['theme', 'side', 'parents']) { const value = new URLSearchParams(location.search).get(key); if (value) target.searchParams.set(key, value); } back.href = target.href;
async function initialize() {
  try { state.config = await request('/config'); if (state.config.enabled) { try { state.me = await request('/me'); rememberRegisteredGuest(state.me.participant); reconcilePending(state.me); } catch (error) { if (error.status !== 401) throw error; } } render(); }
  catch (error) { view.replaceChildren(el('p', 'game-empty', '默契小笺暂时无法打开'), button('重新打开', () => location.reload())); notice(error.message); }
  app.dataset.state = 'ready';
}
initialize();
