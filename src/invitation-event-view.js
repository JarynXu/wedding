import { getFamilyInvitation } from './family-invitation.js';
import { getCalendarDetails } from './invitation-calendar.js';

const setText = (selector, value) => { document.querySelector(selector).textContent = value; };
const venueName = venue => venue.shortName || venue.name;

export function renderInvitationEvent(config, event, search) {
  document.documentElement.dataset.event = event.id;
  const multiVenue = event.sessions.length > 1;
  const date = event.date;
  setText('#p2Year', date.year);
  setText('#p2Day', `${date.month}/${date.day}`);
  setText('#p2Week', `${date.dayOfWeekZh} ${date.dayOfWeekEn}`);
  const agenda = document.getElementById('p2Agenda');
  const calendarAction = agenda.querySelector('.p2-calendar-wrap');
  const schedule = event.schedule || event.sessions.map(session => ({ time: session.label, title: venueName(session.venue) }));
  agenda.replaceChildren();
  schedule.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'p2-agenda-row';
    row.style.setProperty('--item-index', index);
    for (const [className, text] of [['p2-agenda-time', item.time], ['p2-agenda-event', item.title]]) {
      if (row.childNodes.length) row.append(' ');
      const span = document.createElement('span'); span.className = className; span.textContent = text; row.append(span);
    }
    agenda.append(row);
  });
  if (!event.schedule) {
    const countdown = document.createElement('p'); countdown.className = 'event-countdown'; countdown.id = 'eventCountdown'; agenda.append(countdown);
  }
  agenda.append(calendarAction);

  if (multiVenue) {
    for (const selector of ['#p3HotelName', '#p3HotelEn', '#p3Address', '.p3-map-btn-wrap']) document.querySelector(selector).remove();
    document.querySelector('.p3-castle-img').alt = '';
    const venues = document.createElement('div'); venues.className = 'event-venues';
    for (const session of event.sessions) {
      const section = document.createElement('section'); section.className = 'event-venue';
      const label = document.createElement('p'); label.className = 'event-venue-label'; label.textContent = session.label;
      const name = document.createElement('h2'); name.textContent = venueName(session.venue);
      const address = document.createElement('p'); address.className = 'event-venue-address'; address.textContent = session.venue.shortAddress;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'p3-map-btn glass-surface glass-action';
      button.dataset.openModal = 'mapModal'; button.dataset.venue = session.id;
      const buttonTitle = document.createElement('span'); buttonTitle.className = 'btn-line-main'; buttonTitle.textContent = `✦ ${session.label}导航 ✦`;
      const buttonSubtitle = document.createElement('span'); buttonSubtitle.className = 'btn-line-sub'; buttonSubtitle.textContent = 'LOCATION & NAVIGATION';
      button.append(buttonTitle, buttonSubtitle);
      button.setAttribute('aria-label', `${session.label}导航：${session.venue.name}`);
      section.append(label, name, address, button); venues.append(section);
    }
    document.querySelector('.p3-content').append(venues);
  } else {
    const venue = event.sessions[0].venue;
    setText('#p3HotelName', venue.name); setText('#p3HotelEn', venue.nameEn || ''); setText('#p3Address', venue.shortAddress);
  }

  const family = getFamilyInvitation(config, search);
  const invitation = document.querySelector('.p4-invitation');
  invitation.classList.toggle('p4-family', Boolean(family));
  invitation.classList.toggle('p4-long-signature', Boolean(family && [...family.parents].length > 16));
  const texts = event.texts;
  setText('#p4Inviters', family ? family.parents : config.coupleNamesZh);
  setText('#p4InvitationBadge', family ? texts.familyInvitation.badge : texts.invitationBadge);
  document.getElementById('p4InvitationIntro').hidden = Boolean(family);
  setText('#p4InvitationIntro', family ? '' : texts.invitationIntro);
  setText('#p4InvitationWish', family ? texts.familyInvitation.wish : texts.invitationWish);
  setText('#p4Footnote', `✦ ${family ? texts.familyInvitation.footnote : texts.footnote} ✦`);
  document.getElementById('p4FamilyWedding').hidden = !family;
  setText('#p4FamilyOccasion', texts.familyInvitation.occasion);
  if (family) {
    setText('#p4ChildRole', family.child.role); setText('#p4ChildName', family.child.name);
    setText('#p4PartnerRole', family.partner.role); setText('#p4PartnerName', family.partner.name);
  }
  setText('#p4PoemTime', [date.formattedFullZh, date.ceremonyTime].filter(Boolean).join(' '));
  if (multiVenue) {
    setText('#p4PoemVenue', event.sessions.map(session => `${session.label} · ${venueName(session.venue)}`).join('\n'));
    setText('#p4PoemAddress', '扬州');
  } else {
    const venue = event.sessions[0].venue;
    setText('#p4PoemVenue', venue.name);
    setText('#p4PoemAddress', `（${venue.shortAddress || venue.address}${venue.hall ? ' · ' + venue.hall : ''}）`);
  }

  const details = getCalendarDetails(config, event);
  setText('#calEventTitle', `${details.couple} ${event.name}${multiVenue ? '' : event.sessions[0].label}`);
  setText('#calEventTime', [
    `${date.formattedFullZh} · ${date.dayOfWeekZh}`,
    event.schedule?.map(item => `${item.time} ${item.title}`).join(' · '),
  ].filter(Boolean).join('\n'));
  const calendarLocations = document.getElementById('calEventLoc');
  calendarLocations.replaceChildren(...event.sessions.map(session => {
    const row = document.createElement('div'); row.className = 'calendar-event-location';
    const label = document.createElement('dt'); label.textContent = multiVenue ? session.label : '地点';
    const value = document.createElement('dd');
    const name = document.createElement('span'); name.className = 'calendar-venue-name';
    name.textContent = [venueName(session.venue), session.venue.hall].filter(Boolean).join(' · ');
    value.append(name);
    if (multiVenue) {
      const address = document.createElement('span'); address.className = 'calendar-venue-address';
      address.textContent = session.venue.address;
      value.append(address);
    }
    row.append(label, value);
    return row;
  }));
  if (event.id === 'huimen') applyHuimenCopy();

  function showVenue(sessionId = event.sessions[0].id) {
    const session = event.sessions.find(item => item.id === sessionId);
    if (!session) throw new Error('未知宴席场地');
    const venue = session.venue;
    setText('#mapHotelVal', venue.name); setText('#mapHotelEn', venue.nameEn || session.label);
    setText('#hotelAddressText', venue.address);
    const name = encodeURIComponent(venue.name), address = encodeURIComponent(venue.address);
    const { latitude: lat, longitude: lng } = venue;
    document.getElementById('mapAmapLink').href = venue.amapUrl || `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}`;
    document.getElementById('mapTencentLink').href = `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${name};addr:${address}`;
    // 高德坐标不能作为百度坐标或 Apple 坐标使用；这两个入口按地址查找。
    document.getElementById('mapBaiduLink').href = venue.coordinateSystem === 'gcj02'
      ? `https://api.map.baidu.com/geocoder?address=${address}&output=html`
      : `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${name}&content=${address}&output=html`;
    document.getElementById('mapAppleLink').href = venue.coordinateSystem === 'gcj02'
      ? `https://maps.apple.com/?q=${name},${address}` : `https://maps.apple.com/?ll=${lat},${lng}&q=${name}`;
  }
  showVenue();
  return { showVenue };
}

function applyHuimenCopy() {
  const copy = {
    '.cover-kicker': 'HOMECOMING BANQUET', '.cover-dedication': '回 门 宴 · 敬 邀 亲 朋',
    '.cover-welcome-subtitle': 'TO OUR HOMECOMING BANQUET',
    '.p2-title-cn': '回 门 宴 时 间', '.p3-title-cn': '回 门 宴 地 点',
    '#mapModal .modal-title': '回门宴地点 · 导航', '.stationery-venue-badge': '✦ BANQUET VENUE ✦',
    '#calendarModal .modal-title': '添加回门宴日程', '.calendar-card-badge': '✦ HOMECOMING BANQUET ✦',
    '[data-action="copy-calendar"] .btn-main-title': '复制回门宴日程文本',
    '#calendarModal .calendar-footnote': '午宴、晚宴各保存一条全天日程',
  };
  for (const [selector, text] of Object.entries(copy)) setText(selector, text);
  for (const element of document.querySelectorAll('[aria-label*="婚礼"]')) element.setAttribute('aria-label', element.getAttribute('aria-label').replaceAll('婚礼', '回门宴'));
  const heading = document.querySelector('.chinese-cover-title');
  if (heading) {
    heading.querySelector('div').textContent = '回 门 之 喜';
    heading.querySelector('p').textContent = 'HOMECOMING BANQUET';
    setText('.chinese-cover-blessing', '亲朋相聚 · 共叙喜悦');
    setText('.chinese-caption', '回 门 设 宴 · 敬 候 亲 朋');
  }
}
