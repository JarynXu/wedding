import { InvalidInvitationLinkError } from './family-invitation.js';

/** event 与 theme、家长署名独立；未知宴会不能退回另一份请柬。 */
export function resolveInvitationEvent(search = '') {
  const params = new URLSearchParams(search);
  if (!params.has('event')) return 'wedding';
  if (params.getAll('event').length !== 1 || !['wedding', 'huimen'].includes(params.get('event'))) {
    throw new InvalidInvitationLinkError('event 须为 wedding（婚礼）或 huimen（回门宴），且只能提供一项。');
  }
  if (params.get('event') === 'huimen' && params.has('side') && params.get('side') !== 'bride') {
    throw new InvalidInvitationLinkError('回门宴的家长邀请请使用 side=bride（女方父母）。');
  }
  return params.get('event');
}

const huimen = {
  id: 'huimen',
  name: '回门宴',
  calendarFile: 'huimen.ics',
  allowGames: false,
  date: {
    year: 2026, month: '10', day: '25',
    dayOfWeekZh: '星期日', dayOfWeekEn: 'SUNDAY',
    formattedDate: '2026.10.25', formattedFullZh: '2026年10月25日',
  },
  // 开席时间未定。日历按全天保存，每个场次拥有自己的场地。
  sessions: [
    {
      id: 'lunch', label: '午宴',
      venue: {
        name: '鑫华酒店',
        address: '扬州市邗江区杨寿镇回归路2号', shortAddress: '扬州市邗江区杨寿镇回归路2号',
        latitude: 32.52178861949156, longitude: 119.31565538048743,
        amapUrl: 'https://surl.amap.com/1j3Bc9pcbezn',
        coordinateSystem: 'gcj02',
      },
    },
    {
      id: 'dinner', label: '晚宴',
      venue: {
        name: '海德禧顺·精致淮扬菜·宴会厅', shortName: '海德禧顺',
        address: '扬州市邗江区邗江北路83号', shortAddress: '扬州市邗江区邗江北路83号',
        latitude: 32.40238949077748, longitude: 119.39562812447546,
        amapUrl: 'https://surl.amap.com/1j9hnBx4jdeE',
        coordinateSystem: 'gcj02',
      },
    },
  ],
  texts: {
    invitationBadge: '诚挚邀请您', invitationIntro: '参加我们的回门宴',
    invitationWish: '敬备喜宴，恭候莅临', footnote: '亲朋相聚 · 共叙喜悦',
    familyInvitation: {
      badge: '诚邀您参加', occasion: '的回门宴',
      wish: '敬备喜宴，恭候莅临', footnote: '亲朋相聚 · 共叙喜悦',
    },
  },
};

export function getInvitationEvent(config, search = '') {
  if (resolveInvitationEvent(search) === 'huimen') return huimen;
  return {
    id: 'wedding', name: '婚礼', calendarFile: 'wedding.ics', allowGames: true,
    date: config.date, schedule: config.schedule, texts: config.texts,
    sessions: [{ id: 'lunch', label: '午宴', venue: config.venue }],
  };
}

export function getEventDate(event) {
  return `${event.date.year}-${event.date.month}-${event.date.day}`;
}

/** 中国宴会日期按上海时区计日，不把未确定的开席时间解释为零点。 */
export function daysUntilEvent(event, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return Math.max(0, Math.round((Date.parse(getEventDate(event)) - Date.parse(today)) / 86400000));
}
