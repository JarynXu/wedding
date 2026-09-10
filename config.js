/**
 * 婚礼请柬全局配置文件
 * 修改此文件中的信息，即可直接替换请柬内的所有文字、时间、场地信息与音乐路径！
 */
const WEDDING_CONFIG = {
  // 新人信息
  groom: {
    name: "徐旨越",
    title: "先生",
    phone: "13800000000"
  },
  bride: {
    name: "赵荣蓉",
    title: "女士",
    phone: "13900000000"
  },
  // 英文与花体展示
  coupleNamesZh: "徐旨越 & 赵荣蓉",
  coupleNamesEn: "ZHIYUE & RONGRONG",
  coupleScript: "Zhiyue & Rongrong",
  monogram: "XZ",
  monogramImg: "assets/monogram_xu_zhao.png",

  // 婚礼日期与时间
  date: {
    year: 2026,
    month: "10",
    day: "17",
    dayOfWeekZh: "星期六",
    dayOfWeekEn: "SATURDAY",
    lunarText: "丙午年九月初八",
    formattedDate: "2026.10.17",
    formattedFullZh: "2026年10月17日",
    ceremonyTime: "11:58",
    timeTag: "午宴",
    calendarIso: "2026-10-17T11:58:00"
  },
  dateStr: "2026-10-17T11:58:00",

  // 婚礼日程时间轴 (Page 2)
  schedule: [
    { time: "11:30", title: "宾客进场" },
    { time: "11:58", title: "婚礼仪式" },
    { time: "12:28", title: "喜宴开席" }
  ],

  // 酒店场地与地图导航 (Page 3 & Map Modal)
  venue: {
    name: "东海嘉臣国际大酒店",
    nameEn: "JIACHEN INTERNATIONAL HOTEL",
    hall: "国际厅(三楼)",
    address: "江苏省连云港市东海县晶都大道99号",
    shortAddress: "连云港市东海县晶都大道99号",
    // 经纬度（支持高德/腾讯/百度/苹果地图导航）
    latitude: 34.5428,
    longitude: 118.7612
  },

  // 媒体资源与音乐
  assets: {
    bgMusic: "Close to You-Olivia Ong.mp3",
    musicTitle: "Close to You - Olivia Ong",
    coverBg: "assets/card01_bg.jpg",
    coverFrame: "assets/card01_frame.png",
    cards: [
      "assets/card01_bg.jpg",
      "assets/card_02_hd.jpg",
      "assets/card_03_hd.jpg",
      "assets/card_04_hd.jpg"
    ]
  },

  // 邀请函文案 (Page 4)
  texts: {
    invitationBadge: "诚挚邀请",
    invitationEn: "INVITATION",
    poem: [
      "我们将于 2026年10月17日",
      "在 东海嘉臣国际大酒店",
      "举行神圣浪漫的婚礼与午宴",
      "诚挚邀请您与我们一同见证",
      "并分享这份喜悦与幸福"
    ],
    footnote: "愿与您共赴良辰 · 见证一生所爱"
  }
};

if (typeof window !== "undefined") {
  window.WEDDING_CONFIG = WEDDING_CONFIG;
}
