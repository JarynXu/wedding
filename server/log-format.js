const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const clean = value => String(value ?? '').replace(controls, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const headline = new Set(['time', 'level', 'service', 'instance', 'trace_id', 'span_id', 'event', 'stack']);

/** 终端格式只消费已通过字段白名单的数据，不能接收原始请求或 Error 对象。 */
export function formatLog(data, { format = 'text', color = false } = {}) {
  if (format === 'json') return JSON.stringify(data) + '\n';
  const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const levelColor = { debug: 90, info: 36, warn: 33, error: 31 }[data.level] || 37;
  const detail = Object.entries(data).filter(([key]) => !headline.has(key)).flatMap(([key, value]) => {
    if (key === 'counts') return Object.entries(value).map(([name, count]) => `${name}=${count}`);
    return `${key}=${clean(value)}`;
  }).join(' ');
  const header = `${paint(2, `[${clean(data.time)}]`)} ${paint(levelColor, `[${clean(data.level).toUpperCase()}]`)} [${clean(data.service)}] [${clean(data.instance)}] [${clean(data.trace_id)}] [${clean(data.span_id)}] - ${clean(data.event)}`;
  const stack = Array.isArray(data.stack) ? data.stack.map(line => '\n    ' + paint(31, clean(line.trim()))).join('') : '';
  return header + (detail ? ' ' + detail : '') + stack + '\n';
}

export function logOptions(env, stream) {
  const format = env.LOG_FORMAT || 'text';
  if (!['text', 'json'].includes(format)) throw new Error('LOG_FORMAT 须为 text 或 json');
  const mode = env.LOG_COLOR || 'auto';
  if (!['auto', 'always', 'never'].includes(mode)) throw new Error('LOG_COLOR 须为 auto、always 或 never');
  return { format, color: format === 'text' && mode !== 'never' && (mode === 'always' || (env.NO_COLOR === undefined && Boolean(stream.isTTY))) };
}
