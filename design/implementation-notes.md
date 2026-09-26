# 加载与迎宾照片

## 首屏启动

`build/critical-welcome.js` 将 `src/shell.css`、`src/glass.css`、`src/welcome.css`、加载页字形、通用信封符号和丝绸预览图内嵌到 HTML。输入素材位于 `public/assets/fonts/welcome/` 与 `public/assets/classic/loading-preview.webp`，信封符号为 `public/assets/shared/invitation-mark.svg`。该首屏无需请求外部样式、脚本、图片或字体即可显示。主样式使用非阻塞加载，主脚本等待样式可读后收集资源。高清背景就绪后覆盖预览图。

`src/bootstrap.js` 提供主脚本与主样式失败时的重试入口。字形子集包含加载页现有文字；修改加载页文案时需更新对应字形子集。请柬正文的本地完整字库不受该子集约束。

## 信息呈现顺序

加载页保留英文花体、邀请短句与开启按钮，不显示“婚礼请柬”四字及新人、日期、地点。迎宾页展示新人照片与姓名；第二页展示日期、流程和日历入口；第三页展示场地与地址；末页汇总新人、时间和地点。日历弹窗提供完整日程，供宾客在时间页主动查看和保存。

网页标题和浏览器图标保留新人信息，用于页面识别与分享场景。该信息不受正文的分步呈现约束。标题为“新郎❤️新娘”，OG、页面描述和 Twitter 标签由配置生成并写入原始 HTML。`side` 与 `parents` 参数生成双方家长版副标题，由生产 Node 服务按请求渲染；末页按家长身份显示邀请者与新人称谓。600 × 600 的分享缩略图由迎宾照裁切，处理入口为 `design/prepare-share-image.mjs`。

微信自定义分享的前端接入位于 `src/wechat-share.js`。签名接口为空时不加载 SDK；当前未配置公众号签名服务，不能保证微信卡片的实际显示。接入步骤和验证范围见 [微信分享配置](../docs/wechat-sharing.md)。

## 素材就绪条件

加载入口等待页面实际引用的图片完成解码、所用字体完成加载、音乐文件完整下载并通过离线解码校验。120 秒等待上限触发失败状态，入口保持关闭。重试按钮重新载入页面。资源就绪后显示“开启请柬”，点击入口时播放音乐；手机的播放手势限制不再阻塞加载完成。

等待文案按实际进度的 35%、75% 节点切换为“正在装点浪漫殿堂...”“正在调校礼堂音律...”“即将开启婚礼华章...”。这些文案不改变资源完成条件。

音乐完整文件保存为 Blob，入口点击后播放该 Blob。`OfflineAudioContext` 校验文件，不连接扬声器，解码结果不留作播放缓冲。校验使用 22050Hz 采样率限制临时缓冲区内存，播放保留原始文件。缺少该接口的宿主读取文件元数据，要求有效时长；该兼容路径不验证全部采样帧，两条路径都等待完整文件下载。[MDN：OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)。字体加载使用 [FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)，并等待当前字体请求完成。

`src/fonts.css` 保留字体的 Unicode 分段范围。字库来自 Google Fonts，已保存到 `public/assets/fonts/`，页面请求本站文件。字体授权文件位于该目录及 `public/assets/fonts/LICENSE.txt`。中文仍保留完整分段覆盖，修改姓名或文案不需要重新裁剪字库。

## 迎宾参考图

选定方案保存为 `design/welcome-reference.png`，分辨率为 941 × 1672。`design/prepare-welcome-reference.mjs` 清理原图文字及八片独立花瓣的笔画、投影，并修补受影响的金框。清理阶段避开设计稿中的人像，花束与左下散焦枝叶保留。清理蒙版保存在 `design/welcome-cleanup-mask.png`，区域坐标位于 `design/welcome-reference-layout.json`。

清理完成后，脚本调用 `design/restore-classic-portrait.mjs`，从 `design/迎宾照.jpg` 的 5787 × 8185 婚纱原照恢复面部。两人各自按眼距等比缩放、眼睛中点平移；轮廓羽化，五官内部保持不透明，保留原照像素。发型、头纱与服装沿用迎宾设计，最终导出无损 `public/assets/classic/portrait.webp`。此步骤区别于清理阶段的“保护设计稿人像”，重新生成素材也会执行。原照哈希、定位坐标和面部掩膜位于 `design/classic/`。

姓名和迎宾牌文字使用 HTML 排版。姓名读取 `src/config.js`；迎宾页展示姓名、合影、“TOGETHER FOREVER”及“Welcome”。文字坐标跟随参考图等比裁切。窄长屏补齐边框，角花从参考图提取至 `public/assets/classic/frame-corner.webp`。

素材处理脚本使用 Sharp。默认主题运行 `node design/prepare-welcome-reference.mjs`，再运行 `node design/prepare-share-image.mjs` 更新分享缩略图。默认主题的原照合成使用 `design/portrait-composite.mjs`。独立工具环境可通过 `SHARP_MODULE_PATH` 指定模块路径。

中式版选定成图为 `design/chinese/portrait-source.png`，使用红毯黑鞋版，原生尺寸 1024 × 1536。图像工具的输入为婚纱原照与原照头部细节；参考角色和提示词入口见同目录 `image-prompts.json`。`node design/prepare-chinese-portrait.mjs` 从选定成图导出无损迎宾图、600 × 600 分享缩略图及来源哈希，不执行面部剪贴、重绘、调色或画面拉伸。`portrait-layout.json` 只保存源图路径、画布与分享裁切。脚本打印分享图哈希前 16 位，更新 `src/config.js` 中 `share.chineseImage` 的 `v` 参数后运行验证。

中式迎宾页更换图片素材，保留原有照片缩放、底部渐变、文字位置和入场动画。试制图和旧合成资料保留在 `.temp/archive/`，不进入 Git 或发布资源。

运行 `node --test tests/classic-portrait.test.mjs tests/chinese-portrait.test.mjs` 核对图片契约。默认主题检查原照面部像素；中式主题检查正式 WebP 与选定成图的全画面像素一致、源图哈希和分享图内容版本。

## 毛玻璃面板

`src/glass.css` 提供共用材质，应用于加载页信笺、Welcome 迎宾牌、日历和地图弹窗。`glass-action` 变体用于添加日历、地图导航和活动文字入口，底色透明度低于阅读面板，保留背后图案的色彩。背景模糊作用于面板后方画面，文字和控件保持前景绘制；不支持模糊时使用半透明底色。键盘焦点使用独立轮廓。

加载页按背景、花瓣画布、中央信笺的顺序叠放，退出动画由各层承担。弹窗遮罩使用半透明底色，模糊由卡片承担，避免整个背景中的花瓣同时失去清晰度。加载页信笺、日历和地图面板使用 46%–62% 不透明度的底色与 8px 背景模糊；不支持背景模糊时使用 78% 不透明底色。信息块与次要按钮保留阅读底色，迎宾牌保留原有材质。

`#welcomeGlass` 位于 `#app` 中，层级高于花瓣画布。牌面使用背景模糊与透明色，画布里的同一批花瓣在牌后运动，文字、金框和分隔线作为前景绘制。浏览器不支持背景模糊时使用半透明牌面。

迎宾页通过 `aria-owns` 关联牌面。`syncWelcomeGlass` 根据页面状态控制牌面的入场、退场与可访问性；加载页及其他页面不显示该图层。牌面位置按参考图比例计算，尺寸变化沿用同一坐标关系。

迎宾牌与翻页按钮共用 `--page-next-bottom` 和 `--page-next-size`。牌面底部至少高于按钮完整点击区域 10px，底部位置包含设备安全区。窄屏牌面宽度保留两侧 20px 边距。素材脚本清理参考图中固定的牌框与分隔线，防止牌面移动后留下重影。

## 播放器与歌单

右上角播放器使用 `glass-action`，歌单和操作提示使用阅读面板的玻璃材质。音符旋转，玻璃表面保持静止；中式深色底上的音符使用浅金色。

播放器长按 500ms 打开当前主题的歌单，向下方向键或右键也可打开。移动超过 10px、多指触摸、指针取消、离开页面会取消长按。长按松手后的兼容点击被消费，不触发暂停或关闭歌单。歌单支持点选播放、当前曲目标记、窗口内滚动、点外部关闭和 Escape 关闭；页面不显示长按提示。

`src/music-player.js` 负责手势、歌单与焦点；`src/music.js` 负责曲目资源和播放。点选当前暂停曲目会继续播放该曲，不执行普通暂停按钮的顺序切歌策略。点选曲目在点击调用栈中请求播放，使用已准备的音频 Blob，支持离线切换；宿主拒绝播放时显示失败状态，再次点选可重试。

## 手机日历入口

日历弹窗不预先显示微信操作说明。微信内点击“添加至手机系统日历”时进入 `calendar.html?open=1`，在该地址显示右上角“在默认浏览器打开”的指引，不发起 ICS 请求。指引使用固定定位的小框，不占页面高度；顶部信封标记靠左，为指引留出空间。用户从微信菜单打开外部浏览器时，携带的是日历直达地址。

`calendar.html` 是独立构建入口。文字来自 `src/config.js`，样式、脚本与信封图标由 `build/calendar-entry.js` 内嵌，页面不请求请柬字体、照片或音乐。外部浏览器接收 `?open=1` 后尝试打开同目录的 `wedding.ics`；每次页面加载只发起一次，不在恢复页面时重复触发。浏览器限制自动打开时，保留原生“继续添加日程”链接，点击即可重试。无 JavaScript 时仍可使用该链接。

直达页提供日程和链接复制、返回请柬入口。同一浏览器从同源、同主题与同署名的请柬进入日历页时，“返回请柬”使用浏览器历史返回。跳转前关闭日历弹窗；恢复后停留在原来的请柬页。外部浏览器首次打开直达地址时，返回链接进入普通请柬加载流程。

请柬 HTML 使用 `private, no-cache`，普通导航仍需验证响应，允许浏览器保留返回快照。身份、祝福和活动接口保留禁止缓存的策略。祝福连接在 `pagehide` 时关闭，在 `pageshow` 时重连；页面快照恢复时刷新宾客身份。浏览器回收旧文档后，`history.state` 中的已开启状态与页码用于恢复导航，图片、字体和完整歌单仍须通过本次就绪检查，完成后自动进入。没有就绪资源时仍显示加载或重试状态，历史记录不能代替资源检查。

歌单继续验证更新，返回请柬时带内容版本的音频优先使用浏览器缓存；版本变化后使用新 URL。缓存响应失败时请求网络；首次进入、刷新重试和未带版本的音频遵循普通缓存规则。普通浏览器中从请柬点击日历按钮仍打开 `wedding.ics`，无需经过直达页。浏览器页面快照与 HTTP 资源缓存的区别见 [web.dev：Back/forward cache](https://web.dev/articles/bfcache)。

网页不判断系统是否已保存日程。日历入口不使用等待计时器，不根据页面停留时间报告成功或失败。

日历文件的响应使用 `Content-Type: text/calendar; charset=utf-8` 和 `Content-Disposition: inline; filename="wedding.ics"`。生产 Node 服务与 Vite 开发、预览服务均配置这两个响应头；Vite 由 `build/calendar-response.js` 设置。`node --test tests/calendar-response.test.mjs tests/parent-sharing.test.mjs` 检查开发、预览及生产服务的真实 HTTP 响应。

对照来源为用户提供的 `docs/references/server.js` 中日历文件的响应配置。参考目录中的两份 HTML 相同，其微信分支仍显示操作指引；参考 ICS 与 `public/wedding.ics` 的内容相同。`inline` 表达文件的呈现方式，不能保证微信调用系统日历。线上仍出现下载时，应核对实际网址的响应头、手机系统和微信版本，不能依据配置文件或请求发出就认定导入成功。[MDN：Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition)。

## 页面衔接

祝福气泡在打开的弹窗或活动窗口前暂停播放，活动窗口关闭后继续消费队列。活动窗口使用原生 `dialog.open` 状态；保留在 DOM 中的关闭窗口不能阻塞祝福。

末页活动文字入口位于正文下方、火漆左侧，使用毛玻璃材质。火漆保留原图外观，透明热区与文字入口打开同一个活动窗口。热区按照两套末页底图的原生比例和火漆坐标定位，跟随 `background-size: cover` 的等比缩放与居中裁切。细金线位于火漆边缘；动态提示使用边缘扩散和文字箭头，减少动态效果时保留静态入口。键盘沿文字入口进入活动，返回时焦点回到文字入口。中式地点页的地图按钮位于地址下方。

四页共用 840ms 背景叠化与 14px 方向位移。旧页底图保持不透明，旧文字在 220ms 内退场，新文字按相同的起始延迟展开。切换以动画结束为完成条件；减少动态效果会取消位移及叠化，释放旧页。花瓣画布与音频元素位于页面容器之外，切页保持同一实例。

主请柬的根节点禁止纵向边界回弹，`#app` 使用 `touch-action: none`。触摸监听限定在请柬区域，非被动 `touchmove` 监听阻止默认下拉行为；单指纵向位移超过 45px 时翻页，横向、取消和多指手势不触发翻页。普通按钮和链接的起始触摸不进入翻页识别，底部翻页按钮支持从按钮内开始上滑。弹窗位于请柬触摸区域之外，保留 `pan-y` 滚动并限制滚动传递；独立日历页继续使用普通文档滚动。[Chrome：下拉刷新与边界回弹](https://developer.chrome.com/blog/overscroll-behavior)。

前三页的底部入口使用无文字圆形箭头。箭头连续向下点动两次，圆面轻微缩放，两道细金圈错开扩散，每 3.2 秒重复。点击区域固定为 44 × 44px，与迎宾牌共用底部间距；动效只作用于内部图形。页面不自动翻动，减少动态效果时保留静态圆形按钮和可访问名称。

## 回归验证

运行 `npm run build` 后，使用 `node --test tests/invitation-loading.test.mjs`。测试使用 Playwright；独立工具环境可通过 `PLAYWRIGHT_MODULE_PATH` 指定模块路径，通过 `PLAYWRIGHT_CHANNEL` 选择已安装的浏览器，例如 `msedge`。

测试从生产目录启动临时本地服务器。覆盖 HTML 首屏与外部资源隔离、主脚本及主样式失败、音乐响应中途暂停、资源失败与重试、损坏文件、减少动态效果及就绪后断网播放。页面切换检查前进、返回及跳页的中间帧，验证旧底图覆盖、位移边界、实例连续性及结束清理。毛玻璃检查使用同一画布的固定条纹输入，对比开启与关闭背景模糊的牌内、牌外边缘对比度，并验证动态花瓣恢复。

`tests/action-glass.test.mjs` 使用已知背景条纹检查操作按钮的透光与模糊效果，核对文字和键盘焦点。`tests/music-player.test.mjs` 使用真实鼠标与触摸检查长按、取消、点选、播放失败重试、离线切换和长歌单布局。`tests/invitation-journeys.test.mjs` 使用隔离 PostgreSQL 检查文字入口与火漆入口、原图火漆保护区域、两套主题的手机及桌面布局、活动和日历往返后的祝福显示。
