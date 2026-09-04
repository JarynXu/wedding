# 移动端竖版电子婚礼请柬 (Mobile Wedding Invitation)

专为移动端与微信生态定制的高保真电子婚礼请柬，采用 1:1 视觉分层还原与全屏原生滚动吸附体系。

## ✨ 核心特性

- **1:1 像素级复刻**：忠实还原设计师精修的 8 个屏幕主题卡片。
- **全动态可替换**：
  - **文字与日期**：全部通过 HTML5 / CSS 矢量排版，集中在 `config.js` 管理，随时调整。
  - **新人迎宾照**：支持在 `config.js` 自由替换照片，智能叠加帷幕花艺前景遮罩。
  - **背景音乐**：内置卡农钢琴环绕 BGM，支持自定义 MP3 替换与旋转黑胶控制。
- **极致移动端体验**：
  - 原生 CSS Scroll Snap 垂直整屏吸附翻页。
  - 自动适配 iOS / Android `100dvh` 与安全区。
  - 微信 WebView 及移动端首触静默解锁自动播放。
- **地图导航集成**：卡片 05 内置一键导航抽屉，无缝跳转高德、腾讯、百度、Apple 地图并支持一键复制详细地址。

## 📁 目录结构

```text
├── assets/
│   ├── audio/              # 背景音乐 (wedding-bgm.mp3)
│   └── images/             # 纯净背景底板与新人迎宾照
├── css/
│   └── style.css           # 衬线排版、烫金渐变与全屏吸附样式
├── docs/                   # 设计师效果图与原版素材
├── js/
│   └── main.js             # 动态数据绑定、音乐控制与地图抽屉交互引擎
├── scripts/                # 底图生成与音频合成辅助脚本
├── config.js               # 集中配置文件（新人信息、时间地点、资源路径）
├── index.html              # 主入口页面
└── README.md
```

## ⚙️ 快速配置

直接编辑根目录下的 [`config.js`](./config.js)：

```javascript
window.WEDDING_CONFIG = {
  groom: { name: "新郎姓名", nameEn: "JARYN" },
  bride: { name: "新娘姓名", nameEn: "HANNA" },
  coupleNamesEn: "JARYN & HANNA",
  monogram: "JH",
  date: {
    year: "2025",
    month: "05",
    day: "20",
    formattedDate: "2025.05.20",
    dayOfWeekEn: "SATURDAY",
    ceremonyTime: "17:00"
  },
  venue: {
    name: "玫瑰庄园酒店",
    nameEn: "ROSE MANOR HOTEL",
    address: "杭州市西湖区之江路128号",
    latitude: 30.19854,
    longitude: 120.12568
  },
  assets: {
    welcomePhoto: "assets/images/welcome-photo.jpg",
    bgMusic: "assets/audio/wedding-bgm.mp3"
  }
};
```

## 🚀 本地运行

无需复杂的构建流程，直接使用任意静态服务器即可运行：

```bash
# 使用 Python 启动本地服务器
python -m http.server 8080
```

随后在浏览器访问 `http://localhost:8080` 即可浏览。
