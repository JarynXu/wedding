# Wedding Invitation

移动端竖版婚礼电子请柬。成品以确认的第六版效果图为视觉基准：奶油白与香槟金、深棕色真实帷幔、红白粉真实花艺切图、双人迎宾照、纸张纤维、烫金流光，以及固定视口的分镜式上下切换。

## 页面结构

1. 双人迎宾照封面
2. 结婚宣告
3. 婚礼时间与流程
4. 邀请寄语
5. 婚礼地点与地图导航
6. 婚礼现场与期待相见
7. 第二张双人迎宾照
8. 移动端竖版请柬全文

鼠标滚轮、触摸上下滑动、键盘方向键和右侧分页按钮都会切换完整画面，不会滚动成长页面。

## 修改姓名、日期、地点和文案

编辑根目录 [`config.js`](./config.js)。新人姓名、日期、流程、酒店、地址、地图链接、邀请文案、照片路径和音乐路径均集中在该文件。

仓库中的姓名、时间和地点沿用效果图演示内容，正式发出请柬前应替换为真实信息。

## 替换两张迎宾照

直接覆盖以下文件，保持文件名不变：

- `assets/photos/welcome-1.webp`：第 1 页封面照片
- `assets/photos/welcome-2.webp`：第 7 页新人照片

推荐竖图或可安全居中裁切的照片，建议至少 1200 × 1800 像素。人物位置可在 `styles/cover.css` 的 `.photo-cover` 和 `styles/scenes.css` 的 `.photo-couple` 中通过 `object-position` 调整。

## 替换音乐

默认附带原创氛围音乐用于验证播放功能。可直接覆盖：

`assets/music/wedding-ambient.wav`

也可以放入 MP3 文件，并修改 `config.js` 中的 `media.music`。浏览器禁止无交互自动播放有声媒体，宾客需要点击右上角音乐按钮。

## 素材策略

关键视觉层均为本地栅格素材：真实迎宾照、婚礼现场照片、深棕帷幔切图、红白粉花艺切图、纸张和金箔纹理。SVG 仅用于小型地点图标等界面级元素，不承担核心背景。

## 本地预览

```bash
python3 -m http.server 4173
```

访问 `http://localhost:4173/`。

## GitHub Pages

`.github/workflows/pages.yml` 会在 `main` 分支更新后发布仓库根目录：

https://jarynxu.github.io/wedding/
