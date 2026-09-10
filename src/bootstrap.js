// 构建时内嵌到 HTML；主脚本或样式失败时仍能提供重试入口。
window.invitationBootFailed = function () {
  function showFailure() {
    const overlay = document.getElementById('preloaderOverlay');
    if (!overlay || (overlay.dataset.state && overlay.dataset.state !== 'booting')) return;
    overlay.dataset.state = 'error';
    document.getElementById('preloaderStatus').textContent = '请柬启动未完成';
    document.getElementById('preloaderLoadNote').textContent = '页面资源加载失败，请检查网络后重试';
    const retry = document.getElementById('preloaderRetry');
    retry.hidden = false;
    retry.onclick = () => location.reload();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showFailure, { once: true });
  else showFailure();
};

window.addEventListener('error', event => {
  const target = event.target;
  if (target?.matches?.('script[type="module"],link[data-invitation-styles]')) window.invitationBootFailed();
}, true);
