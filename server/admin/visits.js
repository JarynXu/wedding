const browserNames = { wechat: '微信', safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', other: '其他浏览器' };
const deviceNames = { ios: 'iPhone / iPad', android: '安卓', desktop: '电脑', other: '其他设备' };
const number = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('zh-CN') : '—';
const node = (tag, className, text = '') => { const element = document.createElement(tag); element.className = className; element.textContent = text; return element; };

export class VisitsPanel {
  constructor({ root, request, onAuthError }) {
    Object.assign(this, { root, request, onAuthError });
    this.generation = 0;
  }
  async load() {
    if (this.loading) return;
    this.loading = true;
    const generation = this.generation;
    try {
      const data = await this.request('/admin/api/visits');
      if (generation === this.generation) this.render(data);
    } catch (error) {
      if (generation !== this.generation || this.onAuthError(error)) return;
      this.render({ state: 'unavailable' });
    } finally { if (generation === this.generation) this.loading = false; }
  }
  reset() { this.generation++; this.loading = false; this.render({ state: 'loading' }); }
  render(data) {
    const ready = data.state === 'ready';
    const status = this.root.querySelector('[data-visits-status]');
    status.textContent = ready ? '每 30 秒更新' : data.state === 'not_configured' ? '访问统计尚未启用' : data.state === 'unavailable' ? '暂时无法读取，稍后会重试' : '正在读取访问统计…';
    status.setAttribute('role', 'status');
    this.root.dataset.state = data.state;
    this.root.querySelectorAll('[data-visit-stat]').forEach(element => { element.textContent = ready ? number(data[element.dataset.visitStat]) : '—'; });
    this.root.querySelector('[data-visits-details]').hidden = !ready;
    const note = this.root.querySelector('[data-visits-since]');
    note.textContent = ready && data.startedAt ? '统计始于 ' + new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(data.startedAt)) : ready ? '还没有访问记录，宾客打开请柬后就会开始统计。' : '';
    if (!ready) return;
    this.renderTrend(data.trend);
    this.renderSources('[data-visit-browsers]', data.browsers, browserNames, data.opens);
    this.renderSources('[data-visit-devices]', data.devices, deviceNames, data.opens);
  }
  renderTrend(days) {
    const list = this.root.querySelector('[data-visit-trend]');
    const focusedDate = list.contains(document.activeElement) ? document.activeElement.dataset.visitDay : null;
    list.replaceChildren();
    const maximum = Math.max(1, ...days.map(day => day.visitors));
    for (const day of days) {
      const item = node('li', 'visit-day'), button = node('button', 'visit-day-button');
      button.type = 'button';
      button.dataset.visitDay = day.date;
      button.setAttribute('aria-pressed', String(this.selectedDay === day.date));
      const summary = `${day.date}：${number(day.visitors)} 位访客，${number(day.opens)} 次打开`;
      button.setAttribute('aria-label', summary); button.title = summary;
      const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chart.setAttribute('viewBox', '0 0 32 100'); chart.setAttribute('aria-hidden', 'true');
      const bar = document.createElementNS(chart.namespaceURI, 'rect');
      const height = day.visitors ? Math.max(2, day.visitors / maximum * 96) : 0;
      for (const [key, value] of Object.entries({ x: 6, y: 100 - height, width: 20, height, rx: 2 })) bar.setAttribute(key, String(value));
      chart.append(bar);
      button.append(node('strong', '', number(day.visitors)), chart, node('span', '', day.date.slice(5).replace('-', '/')));
      const show = () => {
        this.selectedDay = day.date;
        list.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        this.root.querySelector('[data-visit-day-summary]').textContent = summary;
      };
      button.onclick = show; button.onfocus = show;
      item.append(button); list.append(item);
    }
    const selected = days.find(day => day.date === this.selectedDay);
    this.root.querySelector('[data-visit-day-summary]').textContent = selected
      ? `${selected.date}：${number(selected.visitors)} 位访客，${number(selected.opens)} 次打开`
      : '点选日期可查看当天的访客和打开次数。';
    if (focusedDate) [...list.querySelectorAll('button')].find(button => button.dataset.visitDay === focusedDate)?.focus({ preventScroll: true });
  }
  renderSources(selector, sources, labels, total) {
    const list = this.root.querySelector(selector); list.replaceChildren();
    if (!sources.length) { list.append(node('li', 'visit-source-empty', '暂无记录')); return; }
    for (const source of sources) {
      const row = node('li', 'visit-source'), label = node('span', '', labels[source.kind] || '其他');
      const count = node('strong', '', `${number(source.opens)} 次 · ${total ? Math.round(source.opens / total * 100) : 0}%`);
      row.append(label, count); list.append(row);
    }
  }
}
