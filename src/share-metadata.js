/** 浏览器标题与分享信息共用新人姓名和站点配置。 */
export function getShareMetadata(config, search = '') {
  const url = new URL(config.share.siteUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('分享站点须为不含凭据、查询参数和片段的 HTTPS 地址');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const family = readFamilyInvitation(new URLSearchParams(search));
  let description = config.share.description;
  if (family) {
    url.searchParams.set('side', family.side);
    url.searchParams.set('parents', family.parents);
    const children = family.side === 'groom'
      ? `儿子${config.groom.name}与儿媳${config.bride.name}`
      : `女儿${config.bride.name}与女婿${config.groom.name}`;
    description = `${family.parents}敬邀亲朋，莅临${children}的婚礼，共享良辰喜悦。`;
  }
  return {
    title: `${config.groom.name}❤️${config.bride.name}`,
    description,
    url: url.href,
    image: new URL(config.share.image, url).href,
    imageWidth: config.share.imageWidth,
    imageHeight: config.share.imageHeight,
    imageAlt: `${config.groom.name}与${config.bride.name}的迎宾合影`,
  };
}

export class InvalidInvitationLinkError extends Error {}

function readFamilyInvitation(params) {
  if (!params.has('side') && !params.has('parents')) return null;
  if (params.getAll('side').length !== 1 || params.getAll('parents').length !== 1) {
    throw new InvalidInvitationLinkError('家长邀请链接须各提供一项 side 和 parents 参数。');
  }
  const side = params.get('side');
  if (side !== 'groom' && side !== 'bride') throw new InvalidInvitationLinkError('side 须为 groom（新郎家）或 bride（新娘家）。');
  const rawParents = params.get('parents');
  const parents = rawParents.normalize('NFC').trim();
  if (!parents || [...parents].length > 60 || /[\u0000-\u001f\u007f<>]/u.test(rawParents)) {
    throw new InvalidInvitationLinkError('parents 须为 1–60 字的家长署名，不能包含换行、控制字符或尖括号。');
  }
  return { side, parents };
}
