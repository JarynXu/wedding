import { getEventDate } from './invitation-event.js';

export function getCalendarDetails(config, event) {
  const rows = [['日期', `${event.date.formattedFullZh} · ${event.date.dayOfWeekZh}`]];
  if (event.schedule) {
    rows.push(['入场', event.schedule[0].time], ['仪式', event.date.ceremonyTime]);
    const venue = event.sessions[0].venue;
    rows.push(['地点', [venue.name, venue.hall].filter(Boolean).join(' · ')], ['地址', venue.address]);
  } else {
    for (const session of event.sessions) rows.push([session.label, `${session.venue.name}\n${session.venue.address}`]);
    rows.push(['日历', '午宴与晚宴分别保存为全天日程。']);
  }
  const title = `${event.name}日程`;
  const couple = `${config.groom.name} & ${config.bride.name}`;
  return { title, couple, rows, file: event.calendarFile,
    text: `【${title}】\n新人：${couple}\n${rows.map(([label, value]) => `${label}：${value}`).join('\n')}` };
}

function escapeIcs(text) {
  return String(text).replaceAll('\\', '\\\\').replace(/\r?\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
}

// RFC 5545 的行长按 UTF-8 字节计算，折行不能拆开汉字。
function foldLine(line) {
  const encoder = new TextEncoder();
  let result = '', width = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (width + size > 75) { result += '\r\n '; width = 1; }
    result += character; width += size;
  }
  return result;
}

/** 时间未定的宴席各生成一条全天日程，UID 与原婚礼日程独立。 */
export function createAllDayCalendar(config, event) {
  if (event.schedule || event.date.calendarIso) throw new Error('已确定时间的宴会不能导出为全天日程');
  const start = getEventDate(event).replaceAll('-', '');
  const nextDay = new Date(Date.parse(getEventDate(event)) + 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wedding Invitation//Banquets//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const session of event.sessions) {
    lines.push('BEGIN:VEVENT', `UID:${event.id}-${start}-${session.id}@wedding.jaryn.com.cn`,
      'DTSTAMP:20261013T000000Z', `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${nextDay}`,
      `SUMMARY:${escapeIcs(`${config.groom.name} & ${config.bride.name} ${event.name}·${session.label}`)}`,
      `DESCRIPTION:${escapeIcs(`${session.label}\n${event.date.formattedFullZh}\n${session.venue.name}\n${session.venue.address}`)}`,
      `LOCATION:${escapeIcs(`${session.venue.name}（${session.venue.address}）`)}`,
      'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'SEQUENCE:0', 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n';
}
