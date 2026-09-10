# 加载与迎宾照片

## 首屏启动

`build/critical-welcome.js` 将 `src/shell.css`、`src/glass.css`、`src/welcome.css`、加载页字形、通用信封符号和丝绸预览图内嵌到 HTML。输入素材位于 `src/assets/welcome/`，信封符号为 `src/assets/invitation-mark.svg`。该首屏无需请求外部样式、脚本、图片或字体即可显示。主样式使用非阻塞加载，主脚本等待样式可读后收集资源。高清背景就绪后覆盖预览图。

`src/bootstrap.js` 提供主脚本与主样式失败时的重试入口。字形子集包含加载页现有文字；修改加载页文案时需更新对应字形子集。请柬正文的本地完整字库不受该子集约束。

## 信息呈现顺序

加载页保留英文花体、邀请短句与开启按钮，不显示“婚礼请柬”四字及新人、日期、地点。迎宾页展示新人照片与姓名；第二页展示日期、流程和日历入口；第三页展示场地与地址；末页汇总新人、时间和地点。日历弹窗提供完整日程，供宾客在时间页主动查看和保存。

网页标题和浏览器图标保留新人信息，用于页面识别与分享场景。该信息不受正文的分步呈现约束。微信分享卡片支持标题、描述和缩略图的独立设置，需完成 JS-SDK 配置；当前项目尚未接入微信自定义分享。[微信官方文档](https://developers.weixin.qq.com/doc/service/guide/h5/jssdk.html)

## 素材就绪条件

加载入口等待页面实际引用的图片完成解码、所用字体完成加载、音乐文件完整下载及浏览器可播放状态。120 秒等待上限触发失败状态，入口保持关闭。重试按钮重新载入页面。音乐播放需要交互的浏览器会显示“点按准备音乐”，该操作不绕过就绪条件。

等待文案按实际进度的 35%、75% 节点切换为“正在装点浪漫殿堂...”“正在调校礼堂音律...”“即将开启婚礼华章...”。这些文案不改变资源完成条件。

音乐完整文件保存为 Blob，入口点击后播放该 Blob。`canplaythrough` 代表浏览器对缓冲能力的估计，不能代替完整下载。[MDN：canplaythrough](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canplaythrough_event)。字体加载使用 [FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)，并等待当前字体请求完成。

`src/fonts.css` 保留字体的 Unicode 分段范围。字库来自 Google Fonts，已保存到 `src/assets/fonts/`，页面请求本站文件。字体授权文件位于该目录及 `public/fonts-LICENSE.txt`。中文仍保留完整分段覆盖，修改姓名或文案不需要重新裁剪字库。

## 迎宾参考图

选定方案保存为 `design/welcome-reference.png`，分辨率为 941 × 1672。`design/prepare-welcome-reference.mjs` 清理原图文字及八片独立花瓣的笔画、投影，并修补受影响的金框，导出 `src/assets/cover-welcome-art.webp`。新人面部与上半身设为保护区域，花束与左下散焦枝叶保留。清理蒙版保存在 `design/welcome-cleanup-mask.png`，区域坐标位于 `design/welcome-reference-layout.json`。

姓名和迎宾牌文字使用 HTML 排版。姓名读取 `src/config.js`；迎宾页展示姓名、合影、“TOGETHER FOREVER”及“Welcome”。文字坐标跟随参考图等比裁切。窄长屏补齐边框，角花从参考图提取至 `src/assets/cover-frame-corner.webp`。

素材处理脚本使用 Sharp，运行入口为 `node design/prepare-welcome-reference.mjs`。独立工具环境可通过 `SHARP_MODULE_PATH` 指定模块路径。旧版纸面合成保留在 `design/compose-cover.mjs`，不再作为当前迎宾页资源。

## 毛玻璃面板

`src/glass.css` 提供共用材质，应用于加载页信笺、Welcome 迎宾牌、日历和地图弹窗。背景模糊作用于面板后方画面，文字和控件保持前景绘制。

加载页按背景、花瓣画布、中央信笺的顺序叠放，退出动画由各层承担。弹窗遮罩使用半透明底色，模糊由卡片承担，避免整个背景中的花瓣同时失去清晰度。日历与地图卡片内的信息块保留透明底色。

`#welcomeGlass` 位于 `#app` 中，层级高于花瓣画布。牌面使用背景模糊与透明色，画布里的同一批花瓣在牌后运动，文字、金框和分隔线作为前景绘制。浏览器不支持背景模糊时使用半透明牌面。

迎宾页通过 `aria-owns` 关联牌面。`syncWelcomeGlass` 根据页面状态控制牌面的入场、退场与可访问性；加载页及其他页面不显示该图层。牌面位置按参考图比例计算，尺寸变化沿用同一坐标关系。

## 页面衔接

四页共用 840ms 背景叠化与 14px 方向位移。旧页底图保持不透明，旧文字在 220ms 内退场，新文字按相同的起始延迟展开。切换以动画结束为完成条件；减少动态效果会取消位移及叠化，释放旧页。花瓣画布与音频元素位于页面容器之外，切页保持同一实例。

## 回归验证

运行 `npm run build` 后，使用 `node --test tests/invitation-loading.test.mjs`。测试使用 Playwright；独立工具环境可通过 `PLAYWRIGHT_MODULE_PATH` 指定模块路径，通过 `PLAYWRIGHT_CHANNEL` 选择已安装的浏览器，例如 `msedge`。

测试从生产目录启动临时本地服务器。覆盖 HTML 首屏与外部资源隔离、主脚本及主样式失败、音乐响应中途暂停、资源失败与重试、损坏文件、减少动态效果及就绪后断网播放。页面切换检查前进、返回及跳页的中间帧，验证旧底图覆盖、位移边界、实例连续性及结束清理。毛玻璃检查使用同一画布的固定条纹输入，对比开启与关闭背景模糊的牌内、牌外边缘对比度，并验证动态花瓣恢复。
