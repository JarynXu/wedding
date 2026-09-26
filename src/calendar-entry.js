(() => {
  const isWechat = /MicroMessenger/i.test(navigator.userAgent);
  document.documentElement.dataset.calendarEnv = isWechat ? 'wechat' : 'browser';
  const status = document.getElementById('calendarStatus');
  const feedback = document.getElementById('calendarFeedback');
  const calendarLink = document.getElementById('calendarOpen');
  const invitationParams = new URLSearchParams(location.search);
  const returnUrl = new URL('./', location.href);
  for (const key of ['theme', 'side', 'parents']) {
    if (invitationParams.has(key)) returnUrl.searchParams.set(key, invitationParams.get(key));
  }
  const backLink = document.querySelector('.back-link');
  backLink.href = returnUrl.href;
  // 同源请柬转入的日历页使用浏览器返回，保留前一文档的资源和所在页。
  // 外部浏览器首次打开直达地址时，原生链接仍进入完整请柬。
  if (document.referrer && history.length > 1) {
    const previous = new URL(document.referrer);
    const invitationPath = previous.pathname === returnUrl.pathname || previous.pathname === new URL('./index.html', location.href).pathname;
    const previousChinese = previous.searchParams.getAll('theme').length === 1 && previous.searchParams.get('theme') === 'chinese';
    const sameInvitation = previous.origin === returnUrl.origin && invitationPath
      && previousChinese === (document.documentElement.dataset.theme === 'chinese')
      && ['side', 'parents'].every(key => previous.searchParams.get(key) === returnUrl.searchParams.get(key));
    if (sameInvitation) backLink.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.back();
    });
  }

  async function copy(text) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('当前浏览器没有剪贴板接口');
      await navigator.clipboard.writeText(text);
      feedback.textContent = '已复制';
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); }
      catch { copied = false; }
      finally { field.remove(); }
      feedback.textContent = copied ? '已复制' : '未能复制，请选择页面文字后复制';
    }
  }

  document.getElementById('calendarCopyLink').addEventListener('click', () => {
    const url = new URL(location.href);
    url.search = returnUrl.search;
    url.searchParams.set('open', '1');
    url.hash = '';
    copy(url.href);
  });
  document.getElementById('calendarCopyDetails').addEventListener('click', () => {
    const details = [...document.querySelectorAll('#calendarDetails > div')]
      .map(row => `${row.querySelector('dt').textContent}：${row.querySelector('dd').textContent}`);
    copy(`【婚礼日程】\n${document.querySelector('.couple').textContent}\n${details.join('\n')}`);
  });
  calendarLink.addEventListener('click', () => {
    status.textContent = '请在日历窗口中确认添加。';
  });
  document.documentElement.dataset.calendarScript = 'ready';

  // 每次打开直达地址只尝试一次；从日历返回页面时不在 pageshow 中重复发起。
  // 自动导航被浏览器限制时，原生链接仍可通过一次点击打开。
  if (!isWechat && new URLSearchParams(location.search).get('open') === '1') {
    status.textContent = '请在日历窗口中确认添加；未出现窗口时，可点击下方按钮。';
    try { location.assign(calendarLink.href); }
    catch { status.textContent = '日程未能打开，请点击下方按钮继续。'; }
  }
})();
