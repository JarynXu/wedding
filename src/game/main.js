import { bindHapticControls } from '../haptics.js';
import { LeaderboardView } from './leaderboard.js';
import '../fonts.css';
import './style.css';
import '../glass.css';
import { InvitationDialogs } from '../dialog.js';
import { guestName, rememberRegisteredGuest } from '../guest-name.js';
import { ConversationView } from './conversation.js';
import { gameRules, gameIntroduction } from './rules.js';
import { resolveInvitationTheme } from '../invitation-theme.js';
import { getCaptchaProof } from './captcha.js';
import { RosePetals } from '../petals.js';

document.documentElement.dataset.theme = resolveInvitationTheme(location.search);
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
let active = true;
const atmosphere=document.createElement('div');atmosphere.className='game-atmosphere';atmosphere.setAttribute('aria-hidden','true');
const petalsCanvas=document.createElement('canvas');atmosphere.append(petalsCanvas);document.body.prepend(atmosphere);
const petals=new RosePetals(petalsCanvas);petals.start().catch(()=>{petalsCanvas.dataset.state='unavailable';});
window.addEventListener('pagehide',event=>{if(!event.persisted)petals.destroy();});
const app = document.getElementById('gameApp');
const view = document.getElementById('gameContent');
const dialogs = new InvitationDialogs();
const hapticControls=new AbortController();bindHapticControls(document,hapticControls.signal);
window.addEventListener('pagehide',event=>{if(!event.persisted)hapticControls.abort();});
const tabs = document.querySelectorAll('[data-game-tab]');
const state = { navigation:[], introRequired:true, config: null, me: null, tab: !embedded&&['board','rules'].includes(history.state?.gameView)?history.state.gameView:'play', busy: false, current: null, draft: '', pending: null, challenge: null, phone: '', name: guestName(), consent: false, countdown: 0, identityGeneration:0, refreshing:false, boardGeneration:0 };
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
const menu = document.getElementById('gameMenu'), menuToggle = document.getElementById('gameMenuToggle');
function selectView(tab) {
  closeMenu();
  if(tab===state.tab)return;
  if(tab==='play'&&['board','rules'].includes(state.tab)){returnView();return;}
  if(embedded)state.navigation.push(state.tab);else history.pushState({...history.state,gameView:tab},'');
  state.tab=tab;render();
}
function returnView(){if(embedded){state.tab=state.navigation.pop()||'play';render();}else history.back();}
window.addEventListener('popstate',event=>{if(embedded)return;dialogs.finish(false);state.tab=['board','rules'].includes(event.state?.gameView)?event.state.gameView:'play';render();});
function updateNavigation(){
  const board=state.tab==='board',rules=state.tab==='rules',back=document.getElementById('backToInvitation');
  back.setAttribute('aria-label',state.tab==='play'?'关闭互动':'返回上一页');back.querySelector('path').setAttribute('d',state.tab==='play'?'m6 6 12 12M6 18 18 6':'m14 6-6 6 6 6');
  document.getElementById('gameViewTitle').textContent=board?'默契榜':rules?'游戏规则':'喜宴司仪';document.getElementById('showGameRules').hidden=rules;
}

function closeMenu() { menu.hidden = true; menuToggle.setAttribute('aria-expanded', 'false'); }
menuToggle.onclick = () => { menu.hidden = !menu.hidden; menuToggle.setAttribute('aria-expanded', String(!menu.hidden)); };
document.addEventListener('pointerdown', event => { if (!event.target.closest('.game-menu-wrap')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { closeMenu(); menuToggle.focus(); } });
const showRules=()=>selectView('rules');
document.getElementById('showGameRules').onclick = showRules;
document.getElementById('gameLogout').onclick = async () => {
  closeMenu();
  try {
    state.identityGeneration++; await request('/auth/logout', {}); state.chat?.destroy(); state.chat = null;
    state.me = null; state.pending = null; savePending(); state.challenge = null; state.tab = 'play'; render();
  } catch (error) { notice(error.message); }
};
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
  updateNavigation();
  if(state.config?.enabled&&state.introRequired){app.dataset.view='introduction';view.replaceChildren();return;}
  app.dataset.view = state.tab !== 'play' ? state.tab : state.me ? 'chat' : 'login';
  tabs.forEach(tab => { tab.setAttribute('aria-pressed', String(tab.dataset.gameTab === state.tab)); tab.hidden = tab.dataset.gameTab === state.tab; });
  view.dataset.mode = state.tab === 'play' && state.me ? 'chat' : state.tab;
  document.getElementById('gameLogout').hidden = !state.me;
  document.getElementById('showGameRules').disabled=!state.config?.enabled;
  if(state.config?.enabled&&state.tab==='play'&&state.me){renderPlay();return;}
  view.replaceChildren();
  if (!state.config?.enabled) { view.append(el('p', 'game-empty', '默契挑战正在准备中。')); return; }
  if (state.tab === 'board') { renderBoard(); return; }
  if (state.tab === 'rules') { const content=gameRules(state.config);content.classList.add('game-rules-page');view.append(content);return; }
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
    const agreed=await dialogs.show({title:'发一条验证码给你',content:'手机号用来保存答题进度，婚礼当天核对领奖。号码不会公开。是否同意并接收验证码？',confirmText:'同意并获取',cancelText:'再想想',kind:'consent',focusAfter:form.elements.code});
    if(agreed){form.elements.consent.checked=true;state.consent=true;}
    return agreed;
  };
  const getCode=button('获取验证码',async()=>{
    if(state.busy||state.countdown>Date.now())return;
    // 在按钮手势内取得真实输入焦点；短信响应后继续保留，避免首次聚焦晚于网络请求。
    if(form.elements.consent.checked&&/^(?:\+86)?1\d{10}$/.test(form.elements.phone.value.replace(/[ -]/g,'')))form.elements.code.focus({preventScroll:true});
    state.busy=true;getCode.disabled=true;
    let requested=false;
    try {
      if(!/^(?:\+86)?1\d{10}$/.test(form.elements.phone.value.replace(/[ -]/g,''))){await notice('请填写11位手机号，用于游戏兑奖。');form.elements.phone.focus();return;}
      if(!await ensureConsent())return;
      state.phone=form.elements.phone.value;state.name=form.elements.name.value;state.challenge=id();
      const focusCode=()=>{if(form.isConnected)form.elements.code.focus({preventScroll:true});};
      const captcha=await getCaptchaProof(state.config.captchaId,focusCode);requested=true;
      form.elements.code.placeholder='正在发送验证码…';
      const result=await request('/auth/code',{phone:state.phone,requestId:state.challenge,captcha});
      state.challenge=result.challengeId;state.countdown=Date.now()+result.retryAfter*1000;
      form.elements.code.placeholder=result.delivery==='sent'?'验证码已发送':'请输入收到的验证码';focusCode();
      if(result.delivery!=='sent')await notice('发送结果待确认，请查看是否收到短信。');
    }catch(error){notice(error.message);if(requested&&(!error.status||error.status>=500||error.status===429))state.countdown=Date.now()+60000;}
    finally{state.busy=false;getCode.disabled=state.countdown>Date.now();}
  },'game-code-button');getCode.id='getGameCode';row.append(getCode);form.append(row);
  const consent=el('label','game-consent'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='consent';checkbox.checked=state.consent;checkbox.onchange=()=>{state.consent=checkbox.checked;};
  consent.append(checkbox,document.createTextNode('我已阅读并同意'));
  const privacy=button('参与说明',showRules,'game-text-button');consent.append(privacy);form.append(consent);
  const submit=el('button','game-button',state.config.phase==='open'?'请喜宴司仪开场':'和喜宴司仪聊聊');submit.type='submit';form.append(submit);
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
  updateNavigation();
  const person=state.me.participant;
  if(!state.chat||state.chat.owner!==person.id){
    state.chat?.destroy();
    state.chat=new ConversationView({request,notice,uuid:id,owner:person.id,showClaim,isActive:()=>active});
  }
  if(!view.contains(state.chat.root))view.replaceChildren(state.chat.root);
  state.chat.update(state.me,state.config);
  const claimStatus=document.querySelector('.game-claim-status');
  if(claimStatus&&state.me.claim)claimStatus.textContent=state.me.claim.redeemedAt?'这份心意已经领取':'婚礼现场，向工作人员出示这份凭证吧。';
}
function showClaim(){
  if(!state.me?.claim)return;
  const claim=state.me.claim,content=el('div','game-claim');
  content.append(el('p','game-claim-status',claim.redeemedAt?'这份心意已经领取':'婚礼现场，向工作人员出示这份凭证吧。'),el('code','game-claim-code',claim.code.match(/.{1,4}/g).join('-')));
  const copy=button('复制兑奖码',async()=>{try{await navigator.clipboard.writeText(claim.code);copy.textContent='已复制';}catch{notice('没能复制，现场出示手机上的凭证也可以。');}},'game-small-button');
  content.append(copy);dialogs.show({title:claim.prize,content});
}
async function renderBoard(background=false) {
  const generation=++state.boardGeneration;
  state.board ||= new LeaderboardView({refresh:()=>renderBoard()});
  if(!view.contains(state.board.root))view.replaceChildren(state.board.root);
  state.board.root.setAttribute('aria-busy','true');

  try {
    const board=await request('/leaderboard');if(state.tab!=='board'||generation!==state.boardGeneration)return;
    state.board.update(board,state.me);state.boardErrorShown=false;

  }catch(error){if(state.tab==='board'&&generation===state.boardGeneration){

    if(!state.board.rows.size)state.board.empty.textContent='榜单暂时没能展开。';
    if(!background||!state.boardErrorShown){state.boardErrorShown=true;notice(error.message);}
  }}finally{state.board.root.removeAttribute('aria-busy');}
}
async function refresh() {
  if (!active || document.hidden || state.introRequired || state.busy || state.refreshing || !state.config?.enabled) return;
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
      if ((changedConfig || changed && document.activeElement?.tagName !== 'TEXTAREA') && state.tab === 'play') renderPlay();
    }
    if(state.tab==='board') await renderBoard(true);
    state.pollErrorShown=false;
  } catch (error) { if (error.status === 401&&identity===state.identityGeneration) { state.me = null; render(); notice('请重新验证手机号。'); } else if(!state.pollErrorShown){state.pollErrorShown=true;notice(error.message);} }
  finally {state.refreshing=false;state.lastRefresh=Date.now();}
}
tabs.forEach(tab=>{tab.onclick=()=>selectView(tab.dataset.gameTab);});
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
function introductionSignature(){return JSON.stringify([state.config.closesAt,state.config.requiredCorrect,state.config.participationLimit,state.config.questions.length,state.config.prizes,'invitation-v1']);}
function introductionAccepted(){try{return localStorage.getItem('wedding.game.joined')===introductionSignature();}catch{return false;}}
function leaveGame(){if(embedded)parent.postMessage({type:'wedding-game-back'},location.origin);else location.assign(target.href);}
async function showFirstRules(){
  if(!state.config?.enabled||!state.introRequired||state.introOpening)return;
  state.introOpening=true;
  const agreed=await dialogs.show({title:'默契挑战',content:gameIntroduction(state.config),confirmText:state.config.phase==='open'?'我来试试':'去看看',cancelText:'先逛逛',kind:'game-intro'});
  state.introOpening=false;
  if(!agreed){leaveGame();return;}
  try{localStorage.setItem('wedding.game.joined',introductionSignature());}catch{}
  state.introRequired=false;render();refresh();
}
async function initialize() {
  try { state.config = await request('/config'); if (state.config.enabled) { try { state.me = await request('/me'); rememberRegisteredGuest(state.me.participant); reconcilePending(state.me); } catch (error) { if (error.status !== 401) throw error; } } state.introRequired=state.config.enabled&&!introductionAccepted();render(); }
  catch (error) { view.replaceChildren(el('p', 'game-empty', '这场小聚暂时没能打开'), button('重新打开', () => location.reload())); notice(error.message); }
  app.dataset.state = 'ready';
  if (embedded) parent.postMessage({type:'wedding-game-ready'}, location.origin);
  else showFirstRules();
}
back.onclick=event=>{if(dialogs.active){event.preventDefault();dialogs.finish(false);}else if(state.tab!=='play'){event.preventDefault();returnView();}else if(embedded){event.preventDefault();parent.postMessage({type:'wedding-game-back'},location.origin);}};
if (embedded) {
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'wedding-game-visibility') return;
    active = event.data.visible === true; petals.hold(active ? null : petals.elapsed);
    if (active) { showFirstRules(); state.name = guestName(); if (!state.me && app.dataset.state === 'ready') render(); if(!state.introRequired){refresh(); state.chat?.refresh();} }
  });
}
const fitViewport = () => {
  // 内嵌时由请柬外层负责避让键盘；子页面只使用获得的窗口尺寸。
  app.style.setProperty('--game-viewport-height', (embedded ? document.documentElement.clientHeight : window.visualViewport?.height || innerHeight) + 'px');
  app.style.setProperty('--game-viewport-top', (embedded ? 0 : window.visualViewport?.offsetTop || 0) + 'px');
};
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport); fitViewport();
initialize();
