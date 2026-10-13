import { getFamilyInvitation } from './family-invitation.js';
import { resolveInvitationTheme } from './invitation-theme.js';
import { publicAssetUrl } from './static-assets.js';
import { getInvitationEvent } from './invitation-event.js';

/** 浏览器标题与分享信息共用新人姓名和站点配置。 */
export function getShareMetadata(config, search = '', staticAssetBase = globalThis.__WEDDING_STATIC_BASE__ || '') {
  const url = new URL(config.share.siteUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('分享站点须为不含凭据、查询参数和片段的 HTTPS 地址');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const theme = resolveInvitationTheme(search);
  if (theme !== 'classic') url.searchParams.set('theme', theme);
  const family = getFamilyInvitation(config, search);
  const event = getInvitationEvent(config, search);
  if (event.id !== 'wedding') url.searchParams.set('event', event.id);
  let description = event.id === 'huimen' ? '诚邀您参加我们的回门宴。' : config.share.description;
  if (family) {
    url.searchParams.set('side', family.side);
    url.searchParams.set('parents', family.parents);
    const children = `${family.child.role}与${family.partner.role}`;
    description = `${family.parents}敬邀亲朋参加${children}的${event.name}，共享良辰喜悦。`;
  }
  return {
    theme,
    title: `${config.groom.name}❤️${config.bride.name}${event.id === 'huimen' ? ' · 回门宴' : ''}`,
    description,
    url: url.href,
    image: new URL(publicAssetUrl(theme === 'chinese' ? config.share.chineseImage : config.share.image, staticAssetBase), url).href,
    imageWidth: config.share.imageWidth,
    imageHeight: config.share.imageHeight,
    imageAlt: `${config.groom.name}与${config.bride.name}的迎宾合影`,
  };
}
