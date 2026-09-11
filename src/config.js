/**
 * 婚礼请柬全局配置。
 * 文案、时间、场地与媒体资源统一在这里维护。
 */
const monogramImgUrl = new URL('./assets/monogram_xu_zhao.png', import.meta.url).href;
const bgMusicUrl = new URL('./assets/Close to You-Olivia Ong.mp3', import.meta.url).href;
const coverBgUrl = new URL('./assets/cover-welcome-art.webp', import.meta.url).href;
const coverFrameUrl = new URL('./assets/card01_frame.png', import.meta.url).href;
const card2Url = new URL('./assets/card_02_hd.jpg', import.meta.url).href;
const card3Url = new URL('./assets/card_03_hd.jpg', import.meta.url).href;
const card4Url = new URL('./assets/card_04_hd.jpg', import.meta.url).href;

export const WEDDING_CONFIG = {
  groom: {
    name: '徐旨越',
    title: '先生',
    phone: '13800000000',
  },
  bride: {
    name: '赵荣蓉',
    title: '女士',
    phone: '13900000000',
  },
  coupleNamesZh: '徐旨越 & 赵荣蓉',
  coupleNamesEn: 'ZHIYUE & RONGRONG',
  coupleScript: 'Zhiyue & Rongrong',
  share: {
    siteUrl: 'https://wedding.jaryn.com.cn',
    description: '良辰已定，佳期将至。诚邀您见证我们的婚礼，与我们共享这一份喜悦。',
    image: '/share/wedding-portrait.jpg',
    imageWidth: 600,
    imageHeight: 600,
    wechatSignatureEndpoint: '', // 配置同站签名接口后启用微信自定义分享；密钥保存在服务端。
  },
  monogram: 'XZ',
  monogramImg: monogramImgUrl,

  date: {
    year: 2026,
    month: '10',
    day: '17',
    dayOfWeekZh: '星期六',
    dayOfWeekEn: 'SATURDAY',
    lunarText: '丙午年九月初八',
    formattedDate: '2026.10.17',
    formattedFullZh: '2026年10月17日',
    ceremonyTime: '11:58',
    timeTag: '午宴',
    calendarIso: '2026-10-17T11:58:00',
  },
  dateStr: '2026-10-17T11:58:00',

  schedule: [
    { time: '11:30', title: '宾客进场' },
    { time: '11:58', title: '婚礼仪式' },
    { time: '12:28', title: '喜宴开席' },
  ],

  venue: {
    name: '东海嘉臣国际大酒店',
    nameEn: 'JIACHEN INTERNATIONAL HOTEL',
    hall: '国际厅(三楼)',
    address: '江苏省连云港市东海县晶都大道99号',
    shortAddress: '连云港市东海县晶都大道99号',
    latitude: 34.5428,
    longitude: 118.7612,
  },

  assets: {
    bgMusic: bgMusicUrl,
    musicTitle: 'Close to You - Olivia Ong',
    coverBg: coverBgUrl,
    coverFrame: coverFrameUrl,
    cards: [coverBgUrl, card2Url, card3Url, card4Url],
  },

  coverSettings: {
    useGildedFrame: true, // 窄屏补齐参考图的金线画框。
  },

  texts: {
    invitationBadge: '诚挚邀请您',
    invitationIntro: '参加我们的婚礼与喜宴',
    invitationWish: '与我们共享喜悦与幸福',
    footnote: '愿与您共赴良辰 · 见证一生所爱',
    familyInvitation: {
      badge: '诚邀您参加',
      occasion: '的婚礼暨喜宴',
      wish: '敬备喜宴，恭候莅临',
      footnote: '愿与您共赴良辰 · 见证幸福时刻',
    },
  },
};
