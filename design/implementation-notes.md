# 加载与迎宾照片

## 首屏启动

`build/critical-welcome.js` 将 `src/shell.css`、`src/glass.css`、`src/welcome.css`、加载页字形、通用信封符号和丝绸预览图内嵌到 HTML。输入素材位于 `src/assets/welcome/`，信封符号为 `src/assets/invitation-mark.svg`。该首屏无需请求外部样式、脚本、图片或字体即可显示。主样式使用非阻塞加载，主脚本等待样式可读后收集资源。高清背景就绪后覆盖预览图。

`src/bootstrap.js` 提供主脚本与主样式失败时的重试入口。字形子集包含加载页现有文字；修改加载页文案时需更新对应字形子集。请柬正文的本地完整字库不受该子集约束。

## 信息呈现顺序

加载页保留英文花体、邀请短句与开启按钮，不显示“婚礼请柬”四字及新人、日期、地点。迎宾页展示新人照片与姓名；第二页展示日期、流程和日历入口；第三页展示场地与地址；末页汇总新人、时间和地点。日历弹窗提供完整日程，供宾客在时间页主动查看和保存。

网页标题和浏览器图标保留新人信息，用于页面识别与分享场景。该信息不受正文的分步呈现约束。标题为“新郎❤️新娘”，OG、页面描述和 Twitter 标签由配置生成并写入原始 HTML。`side` 与 `parents` 参数生成双方家长版副标题，由生产 Node 服务按请求渲染；请柬正文不随家长署名变化。600 × 600 的分享缩略图由迎宾照裁切，处理入口为 `design/prepare-share-image.mjs`。

微信自定义分享的前端接入位于 `src/wechat-share.js`。签名接口为空时不加载 SDK；当前未配置公众号签名服务，不能保证微信卡片的实际显示。接入步骤和验证范围见 [微信分享配置](../docs/wechat-sharing.md)。

## 素材就绪条件

加载入口等待页面实际引用的图片完成解码、所用字体完成加载、音乐文件完整下载并通过离线解码校验。120 秒等待上限触发失败状态，入口保持关闭。重试按钮重新载入页面。资源就绪后显示“开启请柬”，点击入口时播放音乐；手机的播放手势限制不再阻塞加载完成。

等待文案按实际进度的 35%、75% 节点切换为“正在装点浪漫殿堂...”“正在调校礼堂音律...”“即将开启婚礼华章...”。这些文案不改变资源完成条件。

音乐完整文件保存为 Blob，入口点击后播放该 Blob。`OfflineAudioContext` 校验文件，不连接扬声器，解码结果不留作播放缓冲。校验使用 22050Hz 采样率限制临时缓冲区内存，播放保留原始文件。缺少该接口的宿主读取文件元数据，要求有效时长；该兼容路径不验证全部采样帧，两条路径都等待完整文件下载。[MDN：OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)。字体加载使用 [FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)，并等待当前字体请求完成。

`src/fonts.css` 保留字体的 Unicode 分段范围。字库来自 Google Fonts，已保存到 `src/assets/fonts/`，页面请求本站文件。字体授权文件位于该目录及 `public/fonts-LICENSE.txt`。中文仍保留完整分段覆盖，修改姓名或文案不需要重新裁剪字库。

## 迎宾参考图

选定方案保存为 `design/welcome-reference.png`，分辨率为 941 × 1672。`design/prepare-welcome-reference.mjs` 清理原图文字及八片独立花瓣的笔画、投影，并修补受影响的金框，导出 `src/assets/cover-welcome-art.webp`。新人面部与上半身设为保护区域，花束与左下散焦枝叶保留。清理蒙版保存在 `design/welcome-cleanup-mask.png`，区域坐标位于 `design/welcome-reference-layout.json`。

姓名和迎宾牌文字使用 HTML 排版。姓名读取 `src/config.js`；迎宾页展示姓名、合影、“TOGETHER FOREVER”及“Welcome”。文字坐标跟随参考图等比裁切。窄长屏补齐边框，角花从参考图提取至 `src/assets/cover-frame-corner.webp`。

素材处理脚本使用 Sharp，运行入口为 `node design/prepare-welcome-reference.mjs`。独立工具环境可通过 `SHARP_MODULE_PATH` 指定模块路径。旧版纸面合成保留在 `design/compose-cover.mjs`，不再作为当前迎宾页资源。

## 毛玻璃面板

`src/glass.css` 提供共用材质，应用于加载页信笺、Welcome 迎宾牌、日历和地图弹窗。背景模糊作用于面板后方画面，文字和控件保持前景绘制。

加载页按背景、花瓣画布、中央信笺的顺序叠放，退出动画由各层承担。弹窗遮罩使用半透明底色，模糊由卡片承担，避免整个背景中的花瓣同时失去清晰度。加载页信笺、日历和地图面板使用 46%–62% 不透明度的底色与 8px 背景模糊；不支持背景模糊时使用 78% 不透明底色。信息块与次要按钮保留阅读底色，迎宾牌保留原有材质。

`#welcomeGlass` 位于 `#app` 中，层级高于花瓣画布。牌面使用背景模糊与透明色，画布里的同一批花瓣在牌后运动，文字、金框和分隔线作为前景绘制。浏览器不支持背景模糊时使用半透明牌面。

迎宾页通过 `aria-owns` 关联牌面。`syncWelcomeGlass` 根据页面状态控制牌面的入场、退场与可访问性；加载页及其他页面不显示该图层。牌面位置按参考图比例计算，尺寸变化沿用同一坐标关系。

迎宾牌与翻页按钮共用 `--page-next-bottom` 和 `--page-next-size`。牌面底部至少高于按钮完整点击区域 10px，底部位置包含设备安全区。窄屏牌面宽度保留两侧 20px 边距。素材脚本清理参考图中固定的牌框与分隔线，防止牌面移动后留下重影。

## 手机日历入口

日历弹窗不预先显示微信操作说明。微信内点击“添加至手机系统日历”时进入 `calendar.html?open=1`，在该地址显示右上角“在默认浏览器打开”的指引，不发起 ICS 请求。指引使用固定定位的小框，不占页面高度；顶部信封标记靠左，为指引留出空间。用户从微信菜单打开外部浏览器时，携带的是日历直达地址。

`calendar.html` 是独立构建入口。文字来自 `src/config.js`，样式、脚本与信封图标由 `build/calendar-entry.js` 内嵌，页面不请求请柬字体、照片或音乐。外部浏览器接收 `?open=1` 后尝试打开同目录的 `wedding.ics`；每次页面加载只发起一次，不在恢复页面时重复触发。浏览器限制自动打开时，保留原生“继续添加日程”链接，点击即可重试。无 JavaScript 时仍可使用该链接。

直达页提供日程和链接复制、返回请柬入口。普通浏览器中从请柬点击日历按钮仍打开 `wedding.ics`，无需经过直达页。原请柬的完整素材加载条件保持不变。

网页不判断系统是否已保存日程。日历入口不使用等待计时器，不根据页面停留时间报告成功或失败。

日历文件的响应使用 `Content-Type: text/calendar; charset=utf-8` 和 `Content-Disposition: inline; filename="wedding.ics"`。生产 Node 服务与 Vite 开发、预览服务均配置这两个响应头；Vite 由 `build/calendar-response.js` 设置。`node --test tests/calendar-response.test.mjs tests/parent-sharing.test.mjs` 检查开发、预览及生产服务的真实 HTTP 响应。

对照来源为用户提供的 `docs/references/server.js` 中日历文件的响应配置。参考目录中的两份 HTML 相同，其微信分支仍显示操作指引；参考 ICS 与 `public/wedding.ics` 的内容相同。`inline` 表达文件的呈现方式，不能保证微信调用系统日历。线上仍出现下载时，应核对实际网址的响应头、手机系统和微信版本，不能依据配置文件或请求发出就认定导入成功。[MDN：Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition)。

## 页面衔接

四页共用 840ms 背景叠化与 14px 方向位移。旧页底图保持不透明，旧文字在 220ms 内退场，新文字按相同的起始延迟展开。切换以动画结束为完成条件；减少动态效果会取消位移及叠化，释放旧页。花瓣画布与音频元素位于页面容器之外，切页保持同一实例。

主请柬的根节点禁止纵向边界回弹，`#app` 使用 `touch-action: none`。触摸监听限定在请柬区域，非被动 `touchmove` 监听阻止默认下拉行为；单指纵向位移超过 45px 时翻页，横向、取消和多指手势不触发翻页。普通按钮和链接的起始触摸不进入翻页识别，底部翻页按钮支持从按钮内开始上滑。弹窗位于请柬触摸区域之外，保留 `pan-y` 滚动并限制滚动传递；独立日历页继续使用普通文档滚动。[Chrome：下拉刷新与边界回弹](https://developer.chrome.com/blog/overscroll-behavior)。

前三页的底部入口使用无文字圆形箭头。箭头连续向下点动两次，圆面轻微缩放，两道细金圈错开扩散，每 3.2 秒重复。点击区域固定为 44 × 44px，与迎宾牌共用底部间距；动效只作用于内部图形。页面不自动翻动，减少动态效果时保留静态圆形按钮和可访问名称。

## 回归验证

运行 `npm run build` 后，使用 `node --test tests/invitation-loading.test.mjs`。测试使用 Playwright；独立工具环境可通过 `PLAYWRIGHT_MODULE_PATH` 指定模块路径，通过 `PLAYWRIGHT_CHANNEL` 选择已安装的浏览器，例如 `msedge`。

测试从生产目录启动临时本地服务器。覆盖 HTML 首屏与外部资源隔离、主脚本及主样式失败、音乐响应中途暂停、资源失败与重试、损坏文件、减少动态效果及就绪后断网播放。页面切换检查前进、返回及跳页的中间帧，验证旧底图覆盖、位移边界、实例连续性及结束清理。毛玻璃检查使用同一画布的固定条纹输入，对比开启与关闭背景模糊的牌内、牌外边缘对比度，并验证动态花瓣恢复。
