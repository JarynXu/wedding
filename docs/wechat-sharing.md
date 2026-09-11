# 分享配置

## 当前内容

分享数据在 `src/config.js` 的 `share` 中维护。标题由 `groom.name` 与 `bride.name` 组成，格式为“新郎❤️新娘”。

| 配置 | 用途 |
| --- | --- |
| `siteUrl` | 正式 HTTPS 地址；更换域名后重新构建并部署 |
| `description` | 页面描述、OG 描述及分享给好友的副标题 |
| `image` | 公开图片路径，与 `siteUrl` 组合成绝对地址 |
| `chineseImage` | 中式主题的分享缩略图路径 |
| `imageWidth` / `imageHeight` | 分享图片尺寸，与素材保持一致 |
| `wechatSignatureEndpoint` | 同站的公众号签名接口；默认留空 |

`build/share-metadata.js` 在构建时写入普通版标题、OG、Twitter summary、canonical 和图片信息。运行时由 `server/app.js` 按请求参数生成家长版标签，抓取方不需要执行页面脚本。构建与服务共用 `src/share-html.js`，URL 署名按文本编码。`public/share/wedding-portrait.jpg` 是 600 × 600 JPEG，由当前迎宾照裁切，未重绘人物；裁切参数位于 `design/share-image-layout.json`。

修改缩略图时运行 `node design/prepare-share-image.mjs`，脚本需要 Sharp，可通过 `SHARP_MODULE_PATH` 指定工具环境的模块路径。默认迎宾图的五官由 `design/迎宾照.jpg` 恢复，合成记录见 `design/classic/portrait-provenance.json`。当前默认缩略图使用 `?v=original-faces` 版本参数；生成脚本仅用 URL 路径写入文件。图片更新后如遇客户端缓存，可修改图片文件名或地址版本参数与 `share.image`。

## 家长邀请链接

在首页地址后添加 `side` 和 `parents`。`side=groom` 表示新郎家，`side=bride` 表示新娘家。`parents` 是署名，可填写一位或两位家长，程序不追加“夫妇”等称谓。以下姓名为示例，请替换为实际署名：

```text
?side=groom&parents=张先生、李女士
?side=bride&parents=陈女士
```

对应副标题：

- 新郎家：张先生、李女士敬邀亲朋参加爱子与儿媳的婚礼，共享良辰喜悦。
- 新娘家：陈女士敬邀亲朋参加爱女与女婿的婚礼，共享良辰喜悦。

标题、缩略图与前三页沿用普通版。最后一页先显示邀请者，再显示邀请语：普通版由新人署名；家长版由 URL 中的家长署名，并展示“爱子＋儿媳”或“爱女＋女婿”的姓名与婚礼信息。家长身份解析与亲属称谓由 `src/family-invitation.js` 提供，分享卡片与正文共用；最后一页的邀请语在 `src/config.js` 的 `texts` 中维护。

分享链接和 canonical 保留两项家长参数，便于再次转发。调试参数及微信附加的来源参数不进入生成的分享链接；JS-SDK 签名仍使用当前实际访问地址的完整查询参数。

署名上限为 60 字。缺少一项参数、重复参数、无效的 `side`、空署名、控制字符或尖括号会返回 HTTP 400。姓名中的引号、`&` 等字符按 HTML 文本编码，不作为标签执行。包含 `&` 或 `+` 的姓名应使用 URL 编码，建议通过 `URLSearchParams` 生成链接：

```js
const link = new URL('https://wedding.jaryn.com.cn/');
link.search = new URLSearchParams({ side: 'groom', parents: '张先生、李女士' });
console.log(link.href);
```

不携带家长参数的链接使用配置中的普通邀请文案。

## 主题链接

`?theme=chinese` 使用中式主题，`?theme=classic` 或不带参数使用法式主题。未知主题值、重复主题参数按法式版处理，不将 URL 值拼入文件路径。

主题与家长署名可以组合：

```text
https://wedding.jaryn.com.cn/?theme=chinese
https://wedding.jaryn.com.cn/?theme=chinese&side=groom&parents=张先生、李女士
https://wedding.jaryn.com.cn/?theme=chinese&side=bride&parents=陈女士
```

中式版更换开场、肖像、时间、地点与末页的美术、文字位置和按钮样式，沿用当前婚礼内容与交互。分享链接与日历直达页的返回链接保留主题和父母参数。中式分享图片为 `public/share/chinese-wedding-portrait.jpg`，标题与副标题规则不变。

主题首帧由 `build/critical-welcome.js` 内嵌预览图和必要样式。完整图片只加载当前主题。中式肖像的源照片、面部掩膜和合成坐标见 `design/chinese/`；运行 `node design/prepare-chinese-portrait.mjs` 可重建肖像和分享缩略图，需要通过 `SHARP_MODULE_PATH` 提供 Sharp。

中式版验证运行 `node --test tests/chinese-theme.test.mjs tests/chinese-portrait.test.mjs`。图像检查核对原照眼睛与唇部的掩膜、面部主体像素，以及面颊两侧红底和旧发丝的清除结果。界面检查覆盖首帧失败恢复、手机与桌面四页、弹窗、安卓手势和日历返回。

## 部署与运行

执行 `npm ci`、`npm run build` 后，用 `npm start` 启动生产服务，默认监听 `8080`，健康检查为 `/healthz`。Docker 镜像采用 Node 22，保持原有服务端口。

家长版需要当前 Node 服务或等价的动态 HTML 服务。只托管 `dist` 静态文件不会按 URL 参数生成原始 HTML 标签。原来的纯静态 Nginx 入口已移除。

主页响应使用 `Cache-Control: no-store`，避免缓存混用家长文案。带内容哈希的媒体和字体继续使用静态缓存与范围请求，日历文件保留 `text/calendar; charset=utf-8` 和 `Content-Disposition: inline`。

## 微信接入边界

OG 描述网页内容，不保证微信把粘贴的链接生成指定卡片。微信菜单中的自定义分享使用 JS-SDK，需要账号具备对应接口权限、配置 JS 接口安全域名，并取得有效的服务端签名。

好友接口 `updateAppMessageShareData` 支持标题、描述、链接和图片。朋友圈接口 `updateTimelineShareData` 支持标题、链接和图片，没有独立描述字段。接口的成功回调表示分享内容设置完成，不表示宾客已发送分享。

当前仓库已包含前端接入，未提供公众号凭据或签名服务。`wechatSignatureEndpoint` 留空时，仅使用 HTML 元信息；不请求 SDK、不显示错误弹框、不阻塞请柬加载。家长参数不改变微信的接口权限要求。

## 配置签名服务

1. 在公众号后台核对分享接口权限，将访问域名加入 JS 接口安全域名，并按后台要求提供域名验证文件。
2. 在服务端保存 AppID、AppSecret；按微信要求获取并缓存 `access_token`、`jsapi_ticket`。不要把 AppSecret 或 ticket 放进前端配置、`VITE_*` 环境变量或 Git。
3. 部署同站签名接口，例如 `/api/wechat-signature`。可在 Node 服务中接入该路由，或由托管平台转发到签名服务。当前服务没有该接口，不能只填写地址就启用。
4. 接口接收 GET 参数 `url`，返回 JSON 对象，字段为 `appId`（字符串）、`timestamp`（整数秒）、`nonceStr`（字符串）、`signature`（40 位 SHA-1 十六进制字符串）。仅允许为本站合法访问地址签名；不向前端返回 AppSecret、access_token 或 ticket。
5. 将接口路径填入 `share.wechatSignatureEndpoint`。前端只在微信环境内调用它，随后从微信官方地址加载 JS-SDK 1.6.0，配置好友和朋友圈分享内容。

签名 URL 使用当前访问地址，包含查询参数，去掉 `#` 及其后面的内容。它与配置中的正式分享链接承担不同职责，不能用正式首页地址替代所有访问地址的签名。

前端等待上限为 15 秒。SDK 加载失败、签名失败或分享内容配置失败会记录控制台信息，并将 `<html>` 的 `data-wechat-share` 设为 `failed`。其他状态为 `outside-wechat`、`unconfigured`、`configured`，用于开发检查；这些状态不代表实际分享或保存结果。

## 验证

构建后运行 `node --test tests/share-metadata.test.mjs tests/parent-sharing.test.mjs tests/closing-invitation.test.mjs`。测试需要 Playwright，可通过 `PLAYWRIGHT_MODULE_PATH` 与 `PLAYWRIGHT_CHANNEL` 指定工具环境。

检查覆盖原始 HTML 的元信息、双方家长和单人署名、异常参数、HTML 编码、并发响应、域名替换、缩略图尺寸、签名地址、SDK 接口参数及失败处理。最后一页检查覆盖邀请者的阅读顺序与入场顺序、双方称谓、署名文本渲染、小屏与长署名排版。SDK 参数检查使用测试替身，不属于微信真机验证。服务检查覆盖健康检查、静态文件、音乐范围下载、缓存与压缩。

上线后须验证图片链接无需登录即可返回 JPEG，并在微信里打开请柬，使用右上角菜单分别分享给好友和朋友圈，检查实际标题、缩略图与好友副标题。若域名变化，还需更新公众号的接口安全域名及服务端签名允许范围。

依据：[Open Graph 协议](https://ogp.me/)、[微信 JS-SDK 官方文档](https://developers.weixin.qq.com/doc/service/guide/h5/jssdk.html)、[微信官方 SDK](https://res.wx.qq.com/open/js/jweixin-1.6.0.js)。
