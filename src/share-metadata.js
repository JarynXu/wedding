import { getFamilyInvitation } from './family-invitation.js';
import { resolveInvitationTheme } from './invitation-theme.js';

/** 浏览器标题与分享信息共用新人姓名和站点配置。 */
export function getShareMetadata(config, search = '') {
  const url = new URL(config.share.siteUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('分享站点须为不含凭据、查询参数和片段的 HTTPS 地址');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const theme = resolveInvitationTheme(search);
  if (theme !== 'classic') url.searchParams.set('theme', theme);
  const family = getFamilyInvitation(config, search);
  let description = config.share.description;
  if (family) {
    url.searchParams.set('side', family.side);
    url.searchParams.set('parents', family.parents);
    const children = `${family.child.role}与${family.partner.role}`;
    description = `${family.parents}敬邀亲朋参加${children}的婚礼，共享良辰喜悦。`;
  }
  return {
    theme,
    title: `${config.groom.name}❤️${config.bride.name}`,
    description,
    url: url.href,
    image: new URL(theme === 'chinese' ? config.share.chineseImage : config.share.image, url).href,
    imageWidth: config.share.imageWidth,
    imageHeight: config.share.imageHeight,
    imageAlt: `${config.groom.name}与${config.bride.name}的迎宾合影`,
  };
}
