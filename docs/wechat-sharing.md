# 分享配置

## 当前内容

分享数据在 `src/config.js` 的 `share` 中维护。标题由 `groom.name` 与 `bride.name` 组成，格式为“新郎❤️新娘”。

| 配置 | 用途 |
| --- | --- |
| `siteUrl` | 正式 HTTPS 地址；更换域名后重新构建并部署 |
| `description` | 页面描述、OG 描述及分享给好友的副标题 |
| `image` | 公开图片路径，与 `siteUrl` 组合成绝对地址 |
| `imageWidth` / `imageHeight` | 分享图片尺寸，与素材保持一致 |
| `wechatSignatureEndpoint` | 同站的公众号签名接口；默认留空 |

`build/share-metadata.js` 将标题、OG、Twitter summary、canonical 和图片信息写入原始 HTML。抓取方不需要执行页面脚本。`public/share/wedding-portrait.jpg` 是 600 × 600 JPEG，由当前迎宾照裁切，未重绘人物；裁切参数位于 `design/share-image-layout.json`。

修改缩略图时运行 `node design/prepare-share-image.mjs`，脚本需要 Sharp，可通过 `SHARP_MODULE_PATH` 指定工具环境的模块路径。图片更新后如遇客户端缓存，可修改图片文件名与 `share.image`。

## 微信接入边界

OG 描述网页内容，不保证微信把粘贴的链接生成指定卡片。微信菜单中的自定义分享使用 JS-SDK，需要账号具备对应接口权限、配置 JS 接口安全域名，并取得有效的服务端签名。

好友接口 `updateAppMessageShareData` 支持标题、描述、链接和图片。朋友圈接口 `updateTimelineShareData` 支持标题、链接和图片，没有独立描述字段。接口的成功回调表示分享内容设置完成，不表示宾客已发送分享。

当前仓库已包含前端接入，未提供公众号凭据或签名服务。`wechatSignatureEndpoint` 留空时，仅使用静态元信息；不请求 SDK、不显示错误弹框、不阻塞请柬加载。

## 配置签名服务

1. 在公众号后台核对分享接口权限，将访问域名加入 JS 接口安全域名，并按后台要求提供域名验证文件。
2. 在服务端保存 AppID、AppSecret；按微信要求获取并缓存 `access_token`、`jsapi_ticket`。不要把 AppSecret 或 ticket 放进前端配置、`VITE_*` 环境变量或 Git。
3. 部署同站签名接口，例如 `/api/wechat-signature`，并配置 Nginx 将该路径转发到签名服务。当前静态 Nginx 没有该接口，不能只填写地址就启用。
4. 接口接收 GET 参数 `url`，返回 JSON 对象，字段为 `appId`（字符串）、`timestamp`（整数秒）、`nonceStr`（字符串）、`signature`（40 位 SHA-1 十六进制字符串）。仅允许为本站合法访问地址签名；不向前端返回 AppSecret、access_token 或 ticket。
5. 将接口路径填入 `share.wechatSignatureEndpoint`。前端只在微信环境内调用它，随后从微信官方地址加载 JS-SDK 1.6.0，配置好友和朋友圈分享内容。

签名 URL 使用当前访问地址，包含查询参数，去掉 `#` 及其后面的内容。它与配置中的正式分享链接承担不同职责，不能用正式首页地址替代所有访问地址的签名。

前端等待上限为 15 秒。SDK 加载失败、签名失败或分享内容配置失败会记录控制台信息，并将 `<html>` 的 `data-wechat-share` 设为 `failed`。其他状态为 `outside-wechat`、`unconfigured`、`configured`，用于开发检查；这些状态不代表实际分享或保存结果。

## 验证

构建后运行 `node --test tests/share-metadata.test.mjs`。测试需要 Playwright，可通过 `PLAYWRIGHT_MODULE_PATH` 与 `PLAYWRIGHT_CHANNEL` 指定工具环境。

检查覆盖原始 HTML 的元信息、域名替换、缩略图尺寸、签名地址、SDK 接口参数及失败处理。SDK 参数检查使用测试替身，不属于微信真机验证。

上线后须验证图片链接无需登录即可返回 JPEG，并在微信里打开请柬，使用右上角菜单分别分享给好友和朋友圈，检查实际标题、缩略图与好友副标题。若域名变化，还需更新公众号的接口安全域名及服务端签名允许范围。

依据：[Open Graph 协议](https://ogp.me/)、[微信 JS-SDK 官方文档](https://developers.weixin.qq.com/doc/service/guide/h5/jssdk.html)、[微信官方 SDK](https://res.wx.qq.com/open/js/jweixin-1.6.0.js)。
