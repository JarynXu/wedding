/**
 * 婚礼请柬全局配置文件
 * 修改此文件中的信息，即可直接替换请柬内的所有文字、照片路径和音乐！
 */
const WEDDING_CONFIG = {
  // 新人姓名
  groom: {
    name: "Jaryn",
    nameZh: "嘉伦",
  },
  bride: {
    name: "Hanna",
    nameZh: "涵娜",
  },
  // 英文连写展示格式
  coupleNamesEn: "JARYN & HANNA",
  coupleScriptNames: "Jaryn & Hanna",
  // 姓氏字母缩写（用于印章和花体 Monogram）
  monogram: "JH",

  // 婚礼日期与时间
  date: {
    year: 2025,
    month: "05",
    day: "20",
    dayOfWeekEn: "SATURDAY",
    dayOfWeekZh: "星期六",
    formattedDate: "2025.05.20",
    formattedFullZh: "2025年5月20日",
    ceremonyTime: "17:00",
  },

  // 婚礼流程时间轴 (Screen 03)
  schedule: [
    { time: "16:00", title: "嘉宾入场" },
    { time: "17:00", title: "婚礼仪式" },
    { time: "18:30", title: "宴席开始" },
  ],

  // 场地与导航信息 (Screen 05 & Screen 08)
  venue: {
    name: "玫瑰庄园酒店",
    nameEn: "ROSE MANOR HOTEL",
    address: "杭州市西湖区之江路128号",
    // 地图导航经纬度 (高德/腾讯/百度地图导航跳转支持)
    latitude: 30.19854,
    longitude: 120.12568,
    // 自定义地图外链（若留空则自动根据经纬度和地址生成导航链接）
    mapUrl: "",
  },

  // 文案与引言
  texts: {
    // Screen 02 过渡 1
    page02Title: "我们要结婚了",
    page02Sub: "WE ARE GETTING MARRIED",

    // Screen 04 过渡 2
    page04Quote: [
      "在这特别的一天",
      "与您共同见证",
      "我们的幸福时刻"
    ],

    // Screen 06 过渡 3
    page06Text: "期待与您相见",
    page06Sub: "LOOKING FORWARD TO SEEING YOU",

    // Screen 08 邀请函全文
    invitationHeader: "诚挚邀请",
    invitationHeaderEn: "INVITATION",
    invitationBody: [
      "我们将于 2025年5月20日",
      "在 玫瑰庄园酒店",
      "举行婚礼仪式",
      "诚挚邀请您与我们一同见证",
      "并分享这份喜悦与幸福"
    ],
  },

  // 媒体资源路径（可随时替换为你自己的照片与音乐）
  assets: {
    // 迎宾婚纱照
    welcomePhoto: "assets/images/welcome-photo.jpg",
    // 背景音乐音频文件
    bgMusic: "assets/audio/wedding-bgm.mp3",
    // 音乐名称（用于悬浮提示）
    musicTitle: "A Thousand Years - Piano Romance",
  },

  // 网页标题与元信息
  meta: {
    pageTitle: "Jaryn & Hanna 的婚礼请柬",
    shareTitle: "诚挚邀请您参加 Jaryn & Hanna 的婚礼",
    shareDesc: "2025.05.20 我们要结婚了，期待与您相见！",
  }
};

// 导出为全局变量
if (typeof window !== "undefined") {
  window.WEDDING_CONFIG = WEDDING_CONFIG;
}
