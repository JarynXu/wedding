import { KnowledgeEditor } from './knowledge.js';
const knowledgeEditor=new KnowledgeEditor({root:document.querySelector('#gameKnowledgeEditor'),request,onAuthError:handleAuthError});
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const $ = selector => document.querySelector(selector);

const loginView = $('#loginView');
const dashboardView = $('#dashboardView');
const loginForm = $('#loginForm');
const loginButton = $('#loginButton');
const loginError = $('#loginError');
const refreshButton = $('#refreshButton');
const logoutButton = $('#logoutButton');
const runtimeView = $('#runtimeView');
const gameView = $('#gameView');
const dashboardError = $('#dashboardError');
const gameLoading = $('#gameLoading');
const gameEmpty = $('#gameEmpty');
const gameError = $('#gameError');
const gameContent = $('#gameContent');
const gameConfigForm = $('#gameConfigForm');
const gameConfigFields = $('#gameConfigFields');
const gameSaveButton = $('#saveGameButton');
const publishGameButton = $('#publishGameButton');
const gameSaveMessage = $('#gameSaveMessage');
const gameImpactNote = $('#gameImpactNote');
const questionsContainer = $('#questionsContainer');
const participantsLoading = $('#participantsLoading');
const participantsEmpty = $('#participantsEmpty');
const participantsError = $('#participantsError');
const participantsListWrap = $('#participantsListWrap');
const participantsList = $('#participantsList');
const participantsMoreButton = $('#participantsMoreButton');
const participantDetailEmpty = $('#participantDetailEmpty');
const participantDetailError = $('#participantDetailError');
const participantDetailMessage = $('#participantDetailMessage');
const participantDetailContent = $('#participantDetailContent');
const participantSummary = $('#participantSummary');
const answersList = $('#answersList');
const settlementEmpty = $('#settlementEmpty');
const settlementLoading = $('#settlementLoading');
const settlementError = $('#settlementError');
const settlementContent = $('#settlementContent');
const settlementConfirm = $('#settlementConfirm');
const settleButton = $('#settleButton');
const settlementMessage = $('#settlementMessage');
const redemptionForm = $('#redemptionForm');
const redemptionCode = $('#redemptionCode');
const redemptionError = $('#redemptionError');
const redemptionRecord = $('#redemptionRecord');
const redemptionSummary = $('#redemptionSummary');
const redemptionMessage = $('#redemptionMessage');
const redeemButton = $('#redeemButton');

const state = {
  activeView: 'runtime',
  refreshing: false,
  gameLoading: false,
  gameLoaded: false,
  gameData: null,
  participants: [],
  participantNext: null,
  participantsHasMore: false,
  selectedParticipantId: null,
  settlement: null,
  redemption: null,
  refreshTimer: undefined,
};

const statusLabels = {
  ready: ['就绪', 'is-good'],
  connected: ['已连接', 'is-good'],
  connecting: ['连接中', 'is-warn'],
  unavailable: ['不可用', 'is-bad'],
  stopped: ['已停止', 'is-bad'],
  not_configured: ['未配置', 'is-muted'],
  unknown: ['未知', 'is-muted'],
};
const phaseLabels = {
  draft: ['草稿', 'is-warn'],
  open: ['进行中', 'is-good'],
  closed: ['已结束', 'is-warn'],
  settled: ['已结算', 'is-muted'],
};
const answerLabels = {
  pending: ['待判定', 'is-warn'],
  judging: ['判定中', 'is-warn'],
  review: ['待人工复核', 'is-warn'],
  correct: ['正确', 'is-good'],
  incorrect: ['不正确', 'is-bad'],
};
const configuredLabels = {
  true: ['已配置', 'is-good'],
  false: ['未配置', 'is-muted'],
  unknown: ['未知', 'is-muted'],
};
const settlementLabels = {
  true: ['可结算', 'is-good'],
  false: ['未就绪', 'is-warn'],
};

loginForm.addEventListener('submit', event => { event.preventDefault(); login(); });
refreshButton.addEventListener('click', () => refreshActiveView(true));
logoutButton.addEventListener('click', logout);
gameConfigForm.addEventListener('submit', event => { event.preventDefault(); saveGameConfig(); });
publishGameButton.addEventListener('click', publishGame);
$('#gameMaxWinners').addEventListener('input', updatePrizeComposition);
$('#participantsRefreshButton').addEventListener('click', () => loadParticipants({ reset: true }));
participantsMoreButton.addEventListener('click', () => loadParticipants({ reset: false }));
$('#previewSettlementButton').addEventListener('click', loadSettlementPreview);
settlementConfirm.addEventListener('change', updateSettleButton);
settleButton.addEventListener('click', settleGame);
redemptionForm.addEventListener('submit', event => { event.preventDefault(); checkRedemption(); });
redemptionCode.addEventListener('input', resetRedemptionRecord);
redeemButton.addEventListener('click', redeemPrize);
document.querySelectorAll('[data-admin-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.adminView)));
restoreSession();

async function restoreSession() {
  try {
    const data = await request('/admin/api/status');
    showDashboard();
    renderRuntimeStatus(data);
    startRefreshTimer();
  } catch (error) {
    if (error.status === 503) showLoginError(error.message);
  }
}

async function login() {
  setBusy(loginButton, true, '登录中…');
  clearNotice(loginError);
  try {
    await request('/admin/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#username').value, password: $('#password').value }),
    });
    $('#password').value = '';
    showDashboard();
    await refreshStatus();
    startRefreshTimer();
  } catch (error) {
    showLoginError(error.message);
  } finally { setBusy(loginButton, false, '登录后台'); }
}

async function logout() {
  stopRefreshTimer();
  setBusy(logoutButton, true, '退出中…');
  try {
    await request('/admin/api/logout', { method: 'POST' });
    resetGameState();
    showLogin();
  } catch (error) {
    showDashboardError(error.message || '退出登录失败');
    startRefreshTimer();
  } finally { setBusy(logoutButton, false, '退出'); }
}

function selectView(view) {
  if (!['runtime', 'game'].includes(view)) return;
  state.activeView = view;
  runtimeView.hidden = view !== 'runtime';
  gameView.hidden = view !== 'game';
  document.querySelectorAll('[data-admin-view]').forEach(button => {
    const active = button.dataset.adminView === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  refreshButton.textContent = view === 'game' ? '刷新游戏' : '刷新状态';
  if (view === 'game' && !state.gameLoaded) loadGame();
}

async function refreshActiveView(manual = false) {
  if (state.activeView === 'game') await loadGame({ manual });
  else await refreshStatus(manual);
}

async function refreshStatus(manual = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  if (manual) setBusy(refreshButton, true, '刷新中…');
  clearNotice(dashboardError);
  try {
    renderRuntimeStatus(await request('/admin/api/status'));
  } catch (error) {
    if (handleAuthError(error)) return;
    showDashboardError(error.message);
  } finally {
    if (manual) setBusy(refreshButton, false, state.activeView === 'game' ? '刷新游戏' : '刷新状态');
    state.refreshing = false;
  }
}

async function loadGame({ manual = false, includeParticipants = true } = {}) {
  if (state.gameLoading) return false;
  state.gameLoading = true;
  const hadData = state.gameLoaded;
  if (!hadData) showGameLoading();
  else clearNotice(gameError);
  if (manual) setBusy(refreshButton, true, '刷新中…');
  try {
    const data = await request('/admin/api/game');
    if (!data || data.config == null) { state.gameLoaded = false; state.gameData = null; showGameEmpty(); return false; }
    if (!isGamePayload(data)) throw localError('游戏配置数据格式无效');
    applyGameData(data);
    await knowledgeEditor.load();
    if (includeParticipants) await loadParticipants({ reset: true });
    return true;
  } catch (error) {
    if (handleAuthError(error)) return false;
    showGameError(error.message);
    if (!hadData) state.gameLoaded = false;
    return false;
  } finally {
    if (manual) setBusy(refreshButton, false, '刷新游戏');
    state.gameLoading = false;
  }
}

function renderRuntimeStatus(data) {
  setText('#appVersion', data.application?.version);
  setText('#appBuild', data.application?.build);
  setText('#appBuildTime', formatDate(data.application?.buildTime));
  setText('#appCommit', data.application?.commit);
  setText('#startedAt', formatDate(data.instance?.startedAt));
  setText('#uptime', formatDuration(data.instance?.uptimeSeconds));
  setText('#realtimeConnections', data.instance?.realtimeConnections == null ? null : `${data.instance.realtimeConnections} 条`);
  setStatus('#databaseConnection', data.database?.connection);
  setStatus('#databaseRead', data.database?.read);
  setText('#blessingCount', data.blessings?.totalCount == null ? null : `${data.blessings.totalCount} 条`);
  setText('#lastSavedAt', data.blessings?.lastSavedAt == null ? '暂无保存记录' : formatDate(data.blessings.lastSavedAt));
  setStatus('#sseListener', data.notifications?.sseListener);
  setText('#lastRefresh', formatDate(data.generatedAt));
  $('#lastRefresh').dateTime = data.generatedAt || '';
  clearNotice(dashboardError);
}

function renderGame(data) {
  const config = data.config;
  setStatus('#gamePhase', data.phase, phaseLabels);
  $('#gameVersion').textContent = `配置版本 ${valueOrUnknown(config.version)}`;
  const closeText = formatBeijingDate(config.closesAt);
  $('#gameCloseSummary').textContent = closeText === '未知' ? '截止时间未知' : `截止 ${closeText}`;
  for (const key of ['participants', 'pending', 'review', 'qualified', 'awarded', 'redeemed']) setText(`[data-game-stat="${key}"]`, data.stats?.[key]);
  setConfigured('#smsIntegration', data.integrations?.sms?.configured);
  setConfigured('#aiIntegration', data.integrations?.ai?.configured);
  setConfigured('#captchaIntegration', data.integrations?.captcha?.configured);
  $('#gameClosesAt').value = isoToBeijingInput(config.closesAt);
  $('#gameMaxWinners').value = valueOrEmpty(config.participationLimit);
  $('#gameRequiredCorrect').value = valueOrEmpty(config.requiredCorrect);
  $('#prizeFirst').value = valueOrEmpty(config.prizes?.first);
  $('#prizeSecond').value = valueOrEmpty(config.prizes?.second);
  $('#prizeThird').value = valueOrEmpty(config.prizes?.third);
  $('#prizeParticipation').value = valueOrEmpty(config.prizes?.participation);
  $('#judgeInstructions').value = valueOrEmpty(config.judgeInstructions);
  renderQuestions(config.questions);
  updatePrizeComposition();
  const editable = ['draft', 'open', 'closed'].includes(data.phase);
  gameConfigFields.disabled = !editable;
  gameSaveButton.disabled = !editable;
  publishGameButton.disabled = data.phase !== 'draft';
  publishGameButton.textContent = data.phase === 'draft' ? '开放活动' : phaseLabels[data.phase]?.[0] || '不可开放';
  gameImpactNote.hidden = !['open', 'closed'].includes(data.phase);
  gameLoading.hidden = true;
  gameEmpty.hidden = true;
  gameError.hidden = true;
  gameContent.hidden = false;
}

function renderQuestions(questions) {
  const byId = new Map((Array.isArray(questions) ? questions : []).map(question => [question.id, question]));
  questionsContainer.replaceChildren();
  for (let index = 0; index < 6; index++) {
    const id = `q${index + 1}`;
    const question = byId.get(id) || { id, title: '', answer: '', aliases: [], rubric: '' };
    const card = document.createElement('article');
    card.className = 'question-card';
    card.dataset.questionId = id;
    const heading = document.createElement('div');
    heading.className = 'question-heading';
    const title = document.createElement('h4');
    title.textContent = `第 ${index + 1} 题`;
    const questionId = document.createElement('span');
    questionId.className = 'question-id';
    questionId.textContent = id.toUpperCase();
    heading.append(title, questionId);
    const fields = document.createElement('div');
    fields.className = 'question-fields';
    fields.append(
      questionField('题目', 'title', question.title, '题目待填写', 'textarea', true),
      questionField('标准答案', 'answer', question.answer, '标准答案待填写', 'input'),
      questionField('可接受别称', 'aliases', Array.isArray(question.aliases) ? question.aliases.join('\n') : '', '每行一个别称', 'textarea'),
      questionField('评分规则', 'rubric', question.rubric, '评分规则待填写', 'textarea', true),
    );
    card.append(heading, fields);
    questionsContainer.append(card);
  }
}

function questionField(label, field, value, placeholder, type, wide = false) {
  const wrapper = document.createElement('label');
  wrapper.className = `field-group${wide ? ' field-wide' : ''}`;
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  input.dataset.questionField = field;
  input.placeholder = placeholder;
  input.value = valueOrEmpty(value);
  if (type === 'textarea') input.rows = field === 'rubric' ? 3 : 2;
  wrapper.append(caption, input);
  return wrapper;
}

function collectGameConfig() {
  return {
    closesAt: beijingInputToUtc($('#gameClosesAt').value),
    participationLimit: numberOrNull($('#gameMaxWinners').value),
    requiredCorrect: numberOrNull($('#gameRequiredCorrect').value),
    questions: [...questionsContainer.querySelectorAll('.question-card')].map(card => ({
      id: card.dataset.questionId,
      title: card.querySelector('[data-question-field="title"]').value,
      answer: card.querySelector('[data-question-field="answer"]').value,
      aliases: card.querySelector('[data-question-field="aliases"]').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
      rubric: card.querySelector('[data-question-field="rubric"]').value,
    })),
    prizes: {
      first: $('#prizeFirst').value,
      second: $('#prizeSecond').value,
      third: $('#prizeThird').value,
      participation: $('#prizeParticipation').value,
    },
    judgeInstructions: $('#judgeInstructions').value,
  };
}

async function saveGameConfig() {
  clearInlineMessage(gameSaveMessage);
  const expectedVersion = expectedGameVersion();
  if (expectedVersion == null) return;
  setBusy(gameSaveButton, true, '保存中…');
  try {
    const data = await request('/admin/api/game/config', { method: 'PUT', body: JSON.stringify({ expectedVersion, config: collectGameConfig() }) });
    if (!isGamePayload(data)) throw localError('保存响应数据格式无效');
    invalidateSettlementPreview();
    applyGameData(data);
    showInlineMessage(gameSaveMessage, '规则已保存。', false);
    await loadParticipants({ reset: true });
  } catch (error) {
    if (handleAuthError(error)) return;
    showInlineMessage(gameSaveMessage, error.message, true);
    if (error.status === 409) await loadGame();
  } finally {
    gameSaveButton.disabled = !['draft', 'open', 'closed'].includes(state.gameData?.phase);
    gameSaveButton.textContent = '保存规则';
  }
}

async function publishGame() {
  clearInlineMessage(gameSaveMessage);
  const expectedVersion = expectedGameVersion();
  if (expectedVersion == null) return;
  setBusy(publishGameButton, true, '开放中…');
  try {
    await request('/admin/api/game/publish', { method: 'POST', body: JSON.stringify({ expectedVersion }) });
    const loaded = await loadGame();
    if (loaded) showInlineMessage(gameSaveMessage, '活动已开放。', false);
  } catch (error) {
    if (handleAuthError(error)) return;
    showInlineMessage(gameSaveMessage, error.message, true);
  } finally {
    publishGameButton.disabled = state.gameData?.phase !== 'draft';
    publishGameButton.textContent = state.gameData?.phase === 'draft' ? '开放活动' : phaseLabels[state.gameData?.phase]?.[0] || '不可开放';
  }
}

async function loadParticipants({ reset }) {
  if (reset) {
    state.participants = [];
    state.participantNext = null;
    state.participantsHasMore = false;
    clearParticipantDetail();
    participantsList.replaceChildren();
    participantsListWrap.hidden = true;
    participantsEmpty.hidden = true;
  }
  clearNotice(participantsError);
  participantsLoading.hidden = false;
  participantsMoreButton.disabled = true;
  try {
    const query = state.participantNext ? `?before=${encodeURIComponent(state.participantNext)}` : '';
    const data = await request(`/admin/api/game/participants${query}`);
    if (!data || !Array.isArray(data.participants)) throw localError('参与者数据格式无效');
    state.participants.push(...data.participants);
    state.participantNext = typeof data.next === 'string' && data.next ? data.next : null;
    state.participantsHasMore = Boolean(data.hasMore && state.participantNext);
    renderParticipants();
  } catch (error) {
    if (handleAuthError(error)) return;
    showNotice(participantsError, error.message);
  } finally {
    participantsLoading.hidden = true;
    participantsMoreButton.disabled = false;
  }
}

function renderParticipants() {
  participantsList.replaceChildren();
  for (const participant of state.participants) participantsList.append(createParticipantRow(participant));
  participantsEmpty.hidden = state.participants.length !== 0;
  participantsListWrap.hidden = state.participants.length === 0;
  participantsMoreButton.hidden = !state.participantsHasMore;
}

function createParticipantRow(participant) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'participant-row';
  row.setAttribute('role', 'listitem');
  row.addEventListener('click', () => loadParticipant(participant.id));
  const main = document.createElement('span');
  main.className = 'participant-main';
  const name = document.createElement('strong');
  name.textContent = valueOrUnknown(participant.name);
  const contact = document.createElement('span');
  contact.textContent = `${valueOrUnknown(participant.phoneMasked)} · ${answeredLabel(participant.answered)}`;
  main.append(name, contact);
  const side = document.createElement('span');
  side.className = 'participant-side';
  const score = document.createElement('strong');
  score.textContent = `得分 ${valueOrUnknown(participant.score)}`;
  const prize = document.createElement('span');
  prize.className = 'participant-prize';
  prize.textContent = participant.prize || '未分配奖项';
  side.append(score, prize);
  row.append(main, side);
  return row;
}

async function loadParticipant(id) {
  const participantId = String(id);
  state.selectedParticipantId = participantId;
  participantDetailEmpty.hidden = false;
  participantDetailEmpty.textContent = '正在读取答卷…';
  participantDetailContent.hidden = true;
  clearNotice(participantDetailError);
  clearInlineMessage(participantDetailMessage);
  try {
    const data = await request(`/admin/api/game/participants/${encodeURIComponent(participantId)}`);
    if (!data?.participant || !Array.isArray(data.answers)) throw localError('答卷数据格式无效');
    renderParticipantDetail(data);
  } catch (error) {
    if (handleAuthError(error)) return;
    participantDetailEmpty.textContent = '答卷暂时无法读取。';
    showNotice(participantDetailError, error.message);
  }
}

function renderParticipantDetail(data) {
  participantDetailEmpty.hidden = true;
  participantDetailContent.hidden = false;
  const participant = data.participant;
  renderDefinitionList(participantSummary, [
    ['姓名', participant.name],
    ['手机号', participant.phoneMasked],
    ['得分', participant.score],
    ['答题状态', answeredLabel(participant.answered)],
    ['达标时间', formatDate(participant.qualifiedAt)],
    ['奖项', participant.prize || '未分配奖项'],
    ['核销时间', formatDate(participant.redeemedAt)],
  ]);
  answersList.replaceChildren();
  if (!data.answers.length) {
    const empty = document.createElement('div');
    empty.className = 'sub-state';
    empty.textContent = '暂无答卷记录。';
    answersList.append(empty);
  }
  for (const answer of data.answers) answersList.append(createAnswerCard(answer));
  if(data.conversation?.length){
    const details=document.createElement('details');details.className='evaluation-details';const title=document.createElement('summary');title.textContent='完整聊天记录';details.append(title);
    for(const turn of data.conversation){const entry=document.createElement('article');entry.className='evaluation-record';
      if(turn.input)entry.append(recordField('宾客',turn.input));
      for(const message of turn.reply?.messages||[])entry.append(recordField('主持人',message));
      if(turn.audit?.intent)entry.append(recordField('意图',turn.audit.intent.intent),recordField('处理依据',turn.audit.intent.reason));
      if(turn.reply?.retryable){
        const reason=document.createElement('textarea');reason.placeholder='填写处理依据';reason.className='review-reason';entry.append(reason);
        for(const [decision,label]of[['ignore','作为聊天，不计题'],['correct','作为回答，判为正确'],['incorrect','作为回答，判为不正确']]){
          const action=document.createElement('button');action.type='button';action.className='small-button';action.textContent=label;
          action.onclick=async()=>{action.disabled=true;try{await request(`/admin/api/game/conversation/${turn.id}/resolve`,{method:'POST',body:JSON.stringify({decision,reason:reason.value})});invalidateSettlementPreview();await loadParticipant(state.selectedParticipantId);await refreshGameSummary();}catch(error){showNotice(participantDetailError,error.message);}finally{action.disabled=false;}};
          entry.append(action);
        }
      }
      details.append(entry);
    }
    answersList.append(details);
  }
}

function createAnswerCard(answer) {
  const card = document.createElement('article');
  card.className = 'answer-card';
  const top = document.createElement('div');
  top.className = 'answer-top';
  const title = document.createElement('h4');
  title.textContent = valueOrUnknown(answer.questionTitle || answer.questionId);
  const status = document.createElement('span');
  status.className = 'status-badge';
  setStatusNode(status, answer.status, answerLabels);
  top.append(title, status);
  const answerText = document.createElement('p');
  answerText.className = 'answer-text';
  answerText.textContent = answer.text == null || answer.text === '' ? '未收到回答' : answer.text;
  const meta = document.createElement('div');
  meta.className = 'answer-meta';
  meta.append(metaText(`版本 ${valueOrUnknown(answer.version)}`), metaText(formatDate(answer.receivedAt)));
  card.append(top, answerText, meta);
  if (answer.reason) {
    const reason = document.createElement('p');
    reason.className = 'answer-reason';
    reason.textContent = `判定说明：${answer.reason}`;
    card.append(reason);
  }
  card.append(createEvaluationDetails(answer));
  if (state.gameData?.phase !== 'settled' && ['pending', 'judging', 'review', 'correct', 'incorrect'].includes(answer.status)) card.append(createReviewBox(answer));
  return card;
}

function createEvaluationDetails(answer) {
  const evaluations = Array.isArray(answer.evaluations) ? answer.evaluations : [];
  const history = Array.isArray(answer.history) ? answer.history : [];
  const details = document.createElement('details');
  details.className = 'evaluation-details';
  const summary = document.createElement('summary');
  const count = evaluations.length + history.length;
  summary.textContent = `判题与复核记录${count ? `（${count} 条）` : ''}`;
  const body = document.createElement('div');
  body.className = 'evaluation-body';
  if (evaluations.length) {
    body.append(recordSection('模型评审', evaluations.map(createEvaluationRecord)));
  }
  if (history.length) {
    body.append(recordSection('人工与状态历史', history.map(createHistoryRecord)));
  }
  if (!count) {
    const empty = document.createElement('p');
    empty.className = 'sub-state';
    empty.textContent = '暂无判题或复核记录。';
    body.append(empty);
  }
  details.append(summary, body);
  return details;
}

function recordSection(title, records) {
  const section = document.createElement('section');
  section.className = 'evaluation-section';
  const heading = document.createElement('h5');
  heading.textContent = title;
  const list = document.createElement('div');
  list.className = 'evaluation-record-list';
  list.append(...records);
  section.append(heading, list);
  return section;
}

function createEvaluationRecord(evaluation) {
  const record = document.createElement('article');
  record.className = 'evaluation-record';
  const heading = document.createElement('div');
  heading.className = 'record-heading';
  heading.append(recordText(evaluation.stage), recordText(valueOrUnknown(evaluation.model)));
  record.append(heading, recordField('判定', verdictLabel(evaluation.verdict)), recordField('理由', evaluation.reason), recordField('依据', evaluation.evidence));
  return record;
}

function createHistoryRecord(entry) {
  const record = document.createElement('article');
  record.className = 'evaluation-record history-record';
  const heading = document.createElement('div');
  heading.className = 'record-heading';
  heading.append(recordText(`操作人：${valueOrUnknown(entry.actor)}`), recordText(formatDate(entry.createdAt)));
  const result = entry.result || {};
  record.append(heading, recordField('状态', answerStatusLabel(result.status)), recordField('判定', verdictLabel(result.verdict)), recordField('理由', result.reason));
  return record;
}

function recordField(label, value) {
  const field = document.createElement('div');
  field.className = 'record-field';
  const name = document.createElement('span');
  name.className = 'record-label';
  name.textContent = label;
  const content = document.createElement('p');
  content.className = 'record-value';
  content.textContent = value == null || value === '' ? '暂无' : String(value);
  field.append(name, content);
  return field;
}

function recordText(value) {
  const text = document.createElement('span');
  text.textContent = valueOrUnknown(value);
  return text;
}

function verdictLabel(value) {
  return value === 'correct' ? '正确' : value === 'incorrect' ? '不正确' : value === 'review' ? '待复核' : valueOrUnknown(value);
}

function answerStatusLabel(value) {
  return answerLabels[value]?.[0] || valueOrUnknown(value);
}

function createReviewBox(answer) {
  const box = document.createElement('div');
  box.className = 'review-box';
  const reason = document.createElement('textarea');
  reason.className = 'review-reason';
  reason.rows = 2;
  reason.placeholder = '填写人工复核说明';
  reason.value = valueOrEmpty(answer.reason);
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  for (const [verdict, label, className] of [['correct', '判为正确', 'is-correct'], ['incorrect', '判为不正确', 'is-incorrect']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `review-button ${className}`;
    button.textContent = label;
    button.addEventListener('click', () => reviewAnswer(answer, verdict, reason.value, button));
    actions.append(button);
  }
  box.append(reason, actions);
  return box;
}

async function reviewAnswer(answer, verdict, reason, button) {
  const expectedVersion = numberOrNull(answer.version);
  if (expectedVersion == null) { showNotice(participantDetailError, '答卷版本未知，无法复核。'); return; }
  if (!reason.trim()) { showNotice(participantDetailError, '请填写复核说明。'); return; }
  setBusy(button, true, '提交中…');
  clearNotice(participantDetailError);
  try {
    const data = await request(`/admin/api/game/review/${encodeURIComponent(answer.id)}`, { method: 'POST', body: JSON.stringify({ expectedVersion, verdict, reason }) });
    if (data?.ok !== true) throw localError('复核响应未确认成功');
    invalidateSettlementPreview();
    await loadParticipant(state.selectedParticipantId);
    showInlineMessage(participantDetailMessage, '人工复核已保存。', false);
    await refreshGameSummary();
  } catch (error) {
    if (handleAuthError(error)) return;
    showNotice(participantDetailError, error.message);
  } finally { setBusy(button, false, verdict === 'correct' ? '判为正确' : '判为不正确'); }
}

function applyGameData(data) {
  const previous = state.gameData;
  const changed = Boolean(previous && (previous.config?.version !== data.config?.version || previous.phase !== data.phase));
  state.gameData = data;
  state.gameLoaded = true;
  if (changed) {
    invalidateSettlementPreview();
    clearParticipantDetail();
  }
  renderGame(data);
}

async function refreshGameSummary() {
  try {
    const data = await request('/admin/api/game');
    if (!data || data.config == null) { state.gameLoaded = false; state.gameData = null; showGameEmpty(); return; }
    if (!isGamePayload(data)) throw localError('游戏状态数据格式无效');
    applyGameData(data);
  } catch (error) {
    if (!handleAuthError(error)) showGameError(error.message);
  }
}

async function loadSettlementPreview() {
  clearNotice(settlementError);
  clearInlineMessage(settlementMessage);
  settlementEmpty.hidden = true;
  settlementContent.hidden = true;
  settlementLoading.hidden = false;
  try {
    const data = await request('/admin/api/game/settlement-preview');
    if (!data || typeof data.ready !== 'boolean' || !Array.isArray(data.candidates) || typeof data.previewToken !== 'string' || !data.previewToken) throw localError('结算预览数据格式无效');
    state.settlement = data;
    renderSettlement(data);
  } catch (error) {
    if (handleAuthError(error)) return;
    showNotice(settlementError, error.message);
  } finally { settlementLoading.hidden = true; }
}

function invalidateSettlementPreview() {
  state.settlement = null;
  settlementLoading.hidden = true;
  settlementEmpty.hidden = false;
  settlementContent.hidden = true;
  settlementConfirm.checked = false;
  settleButton.disabled = true;
  clearNotice(settlementError);
  clearInlineMessage(settlementMessage);
  setStatus('#settlementReady', 'unknown', settlementLabels);
  $('#settlementReason').textContent = '';
  $('#settlementCandidates').replaceChildren();
}

function renderSettlement(data) {
  setStatus('#settlementReady', String(data.ready), settlementLabels);
  $('#settlementReason').textContent = valueOrUnknown(data.reason);
  const container = $('#settlementCandidates');
  container.replaceChildren();
  for (const candidate of data.candidates) {
    const row = document.createElement('div');
    row.className = 'settlement-row';
    row.setAttribute('role', 'listitem');
    const rank = document.createElement('span');
    rank.className = 'settlement-rank';
    rank.textContent = candidate.rank == null ? '—' : `#${candidate.rank}`;
    const person = document.createElement('span');
    person.className = 'settlement-person';
    const name = document.createElement('strong');
    name.textContent = valueOrUnknown(candidate.name);
    const detail = document.createElement('span');
    detail.textContent = `${valueOrUnknown(candidate.phoneMasked)} · 得分 ${valueOrUnknown(candidate.score)} · 资格顺序 ${valueOrUnknown(candidate.qualificationOrder)}`;
    person.append(name, detail);
    const prize = document.createElement('span');
    prize.className = 'settlement-prize';
    prize.textContent = valueOrUnknown(candidate.prize);
    row.append(rank, person, prize);
    container.append(row);
  }
  if (!data.candidates.length) {
    const empty = document.createElement('div');
    empty.className = 'sub-state';
    empty.textContent = '暂无候选。';
    container.append(empty);
  }
  settlementConfirm.checked = false;
  settlementContent.hidden = false;
  updateSettleButton();
}

async function settleGame() {
  if (!state.settlement?.ready || !settlementConfirm.checked) return;
  const expectedVersion = numberOrNull(state.settlement.configVersion);
  if (expectedVersion == null) { showInlineMessage(settlementMessage, '结算配置版本未知，无法结算。', true); return; }
  if (typeof state.settlement.previewToken !== 'string' || !state.settlement.previewToken) { invalidateSettlementPreview(); showInlineMessage(settlementMessage, '结算预览已失效，请重新生成名单。', true); return; }
  setBusy(settleButton, true, '结算中…');
  clearInlineMessage(settlementMessage);
  try {
    const data = await request('/admin/api/game/settle', { method: 'POST', body: JSON.stringify({ expectedVersion, previewToken: state.settlement.previewToken, confirmed: true }) });
    let message;
    if (data?.alreadySettled) message = '名单已结算。';
    else if (Number.isFinite(data?.awarded)) message = `已结算 ${data.awarded} 人。`;
    else throw localError('结算响应数据格式无效');
    await refreshGameSummary();
    invalidateSettlementPreview();
    showInlineMessage(settlementMessage, message, false);
  } catch (error) {
    if (handleAuthError(error)) return;
    if (error.status === 409) { invalidateSettlementPreview(); showInlineMessage(settlementMessage, error.message, true); return; }
    showInlineMessage(settlementMessage, error.message, true);
  } finally { setBusy(settleButton, false, '确认结算'); updateSettleButton(); }
}

async function checkRedemption() {
  const code = redemptionCode.value.trim();
  clearNotice(redemptionError);
  clearInlineMessage(redemptionMessage);
  if (!code) { showNotice(redemptionError, '请输入兑奖码。'); return; }
  setBusy($('#checkRedemptionButton'), true, '查询中…');
  try {
    const data = await request('/admin/api/game/redemption/check', { method: 'POST', body: JSON.stringify({ code }) });
    if (!isRedemption(data)) throw localError('兑奖状态数据格式无效');
    state.redemption = { ...data, code };
    renderRedemption(data);
  } catch (error) {
    if (handleAuthError(error)) return;
    state.redemption = null;
    redemptionRecord.hidden = true;
    showNotice(redemptionError, error.message);
  } finally { setBusy($('#checkRedemptionButton'), false, '查询状态'); }
}

function renderRedemption(data) {
  renderDefinitionList(redemptionSummary, [
    ['姓名', data.name],
    ['手机号', data.phoneMasked],
    ['奖项', data.prize],
    ['状态', redemptionStatusLabel(data.status)],
    ['核销时间', formatDate(data.redeemedAt)],
  ]);
  redeemButton.disabled = data.status !== 'issued';
  redemptionRecord.hidden = false;
}

async function redeemPrize() {
  if (!state.redemption || state.redemption.status !== 'issued') return;
  if (typeof crypto?.randomUUID !== 'function') { showNotice(redemptionError, '当前浏览器不支持兑奖请求。'); return; }
  setBusy(redeemButton, true, '核销中…');
  clearNotice(redemptionError);
  clearInlineMessage(redemptionMessage);
  try {
    const data = await request('/admin/api/game/redemption', { method: 'POST', body: JSON.stringify({ code: state.redemption.code, requestId: crypto.randomUUID() }) });
    if (!isRedemption(data)) throw localError('核销响应数据格式无效');
    state.redemption = { ...data, code: state.redemption.code };
    renderRedemption(data);
    showInlineMessage(redemptionMessage, data.alreadyRedeemed ? '该兑奖码已核销。' : '核销完成。', false);
  } catch (error) {
    if (handleAuthError(error)) return;
    showNotice(redemptionError, error.message);
  } finally {
    redeemButton.disabled = state.redemption?.status !== 'issued';
    redeemButton.textContent = '确认核销';
  }
}

function resetRedemptionRecord() {
  state.redemption = null;
  redemptionRecord.hidden = true;
  clearNotice(redemptionError);
  clearInlineMessage(redemptionMessage);
}

function updatePrizeComposition() {
  const count = numberOrNull($('#gameMaxWinners').value);
  $('#prizeComposition').textContent = count == null || count < 0 ? '请填写参与奖名额。' : `前三大奖各 1 名，另有参与奖 ${count} 名；每人只领取一个奖项。`;
}

function updateSettleButton() {
  settleButton.disabled = !(state.settlement?.ready === true && settlementConfirm.checked && state.gameData?.phase !== 'settled');
}

function expectedGameVersion() {
  const version = numberOrNull(state.gameData?.config?.version);
  if (version == null) showInlineMessage(gameSaveMessage, '配置版本未知，无法保存。', true);
  return version;
}

function renderDefinitionList(container, entries) {
  container.replaceChildren();
  for (const [label, value] of entries) {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = valueOrUnknown(value);
    wrapper.append(term, detail);
    container.append(wrapper);
  }
}

function clearParticipantDetail() {
  state.selectedParticipantId = null;
  participantDetailEmpty.hidden = false;
  participantDetailEmpty.textContent = '选择参与者查看答卷。';
  participantDetailContent.hidden = true;
  clearNotice(participantDetailError);
  clearInlineMessage(participantDetailMessage);
}

function showGameLoading() {
  gameLoading.hidden = false;
  gameEmpty.hidden = true;
  gameError.hidden = true;
  gameContent.hidden = true;
}

function showGameEmpty() {
  gameLoading.hidden = true;
  gameEmpty.hidden = false;
  gameError.hidden = true;
  gameContent.hidden = true;
}

function showGameError(message) {
  gameLoading.hidden = true;
  gameEmpty.hidden = true;
  gameError.textContent = message || '游戏状态读取失败';
  gameError.hidden = false;
  if (!state.gameLoaded) gameContent.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showLoginError(message) {
  loginError.textContent = message || '请求无法完成';
  loginError.hidden = false;
}

function showDashboardError(message) {
  showNotice(dashboardError, message || '状态读取失败');
}

function showNotice(node, message) {
  node.textContent = message || '请求无法完成';
  node.hidden = false;
}

function clearNotice(node) { node.textContent = ''; node.hidden = true; }

function showInlineMessage(node, message, isError) {
  node.textContent = message || '请求无法完成';
  node.className = `inline-message${isError ? ' is-error' : ''}`;
  node.hidden = false;
}

function clearInlineMessage(node) { node.textContent = ''; node.hidden = true; node.className = 'inline-message'; }

function setStatus(selector, value, labels = statusLabels) { setStatusNode($(selector), value, labels); }

function setStatusNode(node, value, labels = statusLabels) {
  const [label, className] = labels[String(value)] || statusLabels.unknown;
  node.textContent = label;
  node.className = `status-badge ${className}`;
}

function setConfigured(selector, value) {
  const key = value === true ? 'true' : value === false ? 'false' : 'unknown';
  setStatus(selector, key, configuredLabels);
}

function setText(selector, value) { $(selector).textContent = value == null || value === '' ? '未知' : value; }

function metaText(value) {
  const node = document.createElement('span');
  node.textContent = valueOrUnknown(value);
  return node;
}

function valueOrEmpty(value) { return value == null ? '' : String(value); }
function valueOrUnknown(value) { return value == null || value === '' ? '未知' : String(value); }
function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
function answeredLabel(value) { return value === true ? '已答' : value === false ? '未答' : value == null ? '未知' : String(value); }
function redemptionStatusLabel(value) { return value === 'issued' ? '待核销' : value === 'redeemed' ? '已核销' : '未知'; }

function formatDate(value) {
  if (value === 'unknown' || value == null) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '未知';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = Math.floor(seconds % 60);
  return `${days ? `${days}天 ` : ''}${hours}小时 ${minutes}分 ${remainder}秒`;
}

function isoToBeijingInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 16);
}

function beijingInputToUtc(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  const parts = match.slice(1).map(Number);
  const timestamp = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]) - BEIJING_OFFSET_MS;
  const check = new Date(timestamp + BEIJING_OFFSET_MS);
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2] || check.getUTCHours() !== parts[3] || check.getUTCMinutes() !== parts[4]) return '';
  return new Date(timestamp).toISOString();
}

function formatBeijingDate(value) {
  const input = isoToBeijingInput(value);
  return input ? `${input.replace('T', ' ')}（北京时间）` : '未知';
}

function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }

function startRefreshTimer() {
  stopRefreshTimer();
  state.refreshTimer = setInterval(() => { if (state.activeView === 'runtime') refreshStatus(); }, 30000);
}

function stopRefreshTimer() { clearInterval(state.refreshTimer); state.refreshTimer = undefined; }

function resetGameState() {
  state.gameLoaded = false;
  state.gameData = null;
  state.participants = [];
  state.participantNext = null;
  state.participantsHasMore = false;
  state.settlement = null;
  resetRedemptionRecord();
  questionsContainer.replaceChildren();
  participantsList.replaceChildren();
  clearParticipantDetail();
  showGameLoading();
}

function isGamePayload(data) {
  return Boolean(data && typeof data === 'object' && data.config && typeof data.config === 'object' && Array.isArray(data.config.questions) && typeof data.phase === 'string');
}

function isRedemption(data) {
  return Boolean(data && typeof data === 'object' && typeof data.name === 'string' && typeof data.phoneMasked === 'string' && typeof data.prize === 'string' && ['issued', 'redeemed'].includes(data.status));
}

function handleAuthError(error) {
  if (error.status !== 401) return false;
  stopRefreshTimer();
  resetGameState();
  showLogin();
  showLoginError(error.message || '登录已失效，请重新登录');
  return true;
}

function localError(message) { const error = new Error(message); error.status = 0; return error; }

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch { throw localError('网络请求失败'); }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) { const error = new Error(data.message || '请求无法完成'); error.status = response.status; error.data = data; throw error; }
  return data;
}
