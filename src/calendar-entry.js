(() => {
  const isWechat = /MicroMessenger/i.test(navigator.userAgent);
  document.documentElement.dataset.calendarEnv = isWechat ? 'wechat' : 'browser';
  const status = document.getElementById('calendarStatus');
  const feedback = document.getElementById('calendarFeedback');
  const calendarLink = document.getElementById('calendarOpen');
  const browserLink = document.getElementById('calendarOpenBrowser');
  const continuation = new URL(location.href);
  continuation.search = '?open=1';
  continuation.hash = '';

  // 公开网页没有宿主放行的保证，只提供由宾客点击的尝试；不使用计时器轮番唤起应用。
  if (isWechat) {
    const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (isAppleMobile && continuation.protocol === 'https:') {
      browserLink.href = `x-safari-https:${continuation.href.slice('https:'.length)}`;
      browserLink.textContent = '尝试在 Safari 中继续';
    } else if (/Android/.test(navigator.userAgent) && ['http:', 'https:'].includes(continuation.protocol)) {
      browserLink.href = `intent:${continuation.href.slice(continuation.protocol.length)}#Intent;scheme=${continuation.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(continuation.href)};end`;
    }
    browserLink.hidden = !browserLink.hasAttribute('href');
  }
  browserLink.addEventListener('click', () => {
    feedback.textContent = '若未打开，请使用右上角指引或复制链接。';
  });

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
    copy(continuation.href);
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
