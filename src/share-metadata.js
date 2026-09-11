/** 浏览器标题与分享信息共用新人姓名和站点配置。 */
export function getShareMetadata(config) {
  const url = new URL(config.share.siteUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('分享站点须为不含凭据、查询参数和片段的 HTTPS 地址');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return {
    title: `${config.groom.name}❤️${config.bride.name}`,
    description: config.share.description,
    url: url.href,
    image: new URL(config.share.image, url).href,
    imageWidth: config.share.imageWidth,
    imageHeight: config.share.imageHeight,
    imageAlt: `${config.groom.name}与${config.bride.name}的迎宾合影`,
  };
}
