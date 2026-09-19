# 静态资源托管

服务默认使用容器自带资源。`STATIC_ASSET_BASE_URL` 留空，无需额外服务。

## 导出与上传

在与部署版本一致的代码上执行：

```powershell
npm ci
npm run build
npm run static:export
```

导出结果位于 `static-upload/sha256-构建指纹/`。目录包含：

```text
assets/   构建后的脚本、样式、图片和字体
share/    两个主题的分享缩略图
vendor/   图形验证码浏览器 SDK
music/    默认与中式主题的歌单和音频
```

压缩上述四个目录，ZIP 内第一层应为 `assets/`、`share/`、`vendor/`、`music/`。不要把 `static-upload` 或构建指纹目录包在 ZIP 第一层。对应的 `.manifest.json` 位于资源目录外，记录版本、文件路径、字节数和 SHA-256；它用于核对上传结果。

导出不包含网页 HTML、服务端代码、数据库、环境文件、源照片或 source map。无需移动 `src/assets` 中的设计素材。前端源码继续使用 Vite 的相对引用，上传包由构建结果产生。

需与已部署镜像逐文件对应时，从该镜像的 `/app/dist` 取出产物，再执行 `node build/export-static.mjs 产物目录`。不同操作系统或构建版本可能产生不同文件名，禁止把另一个版本的包用于当前容器。

## 配置访问地址

假设上传后的图片可以访问：

```text
https://static.example.com/wedding/v1/share/wedding-portrait.jpg
```

云托管服务配置：

```dotenv
STATIC_ASSET_BASE_URL=https://static.example.com/wedding/v1/
```

重启实例后生效，不需重新构建代码。地址必须对应四个资源目录的父目录，支持子路径。正式地址使用 HTTPS，不接受临时签名参数、账号密码或片段。

页面仍从 `https://wedding.jaryn.com.cn` 打开。登录、后台、聊天、实时祝福、日历下载及微信签名接口使用本站。分享缩略图使用静态地址，标题、父母署名和 canonical 地址保持原有规则。首屏内联背景与字体保留在 HTML 内，打开时无需等待外部资源就有加载页。

## 存储服务设置

- 允许公开读取这四个目录。它们都是浏览器所需的公开资源。
- 允许来源 `https://wedding.jaryn.com.cn` 的 CORS 请求，方法 `GET`、`HEAD`，请求头允许 `Range`，暴露 `Content-Length`、`Content-Range`、`Accept-Ranges`。资源请求不携带登录凭据。试运行域名需加入允许来源。
- 保持 MIME：JS 为 `text/javascript` 或 `application/javascript`，CSS 为 `text/css`，字体为 `font/woff2`，MP3 为 `audio/mpeg`，WebP 为 `image/webp`。不要强制 `Content-Disposition: attachment`。
- 音乐服务需支持字节范围请求，返回 `206` 和正确的 `Content-Range`。上线前检查模块脚本、字体、音频和图片均可读取。
- `assets/` 的文件名带内容指纹，可设置 `Cache-Control: public, max-age=31536000, immutable`。`share/` 和 `vendor/` 无指纹，使用短缓存并保留验证请求，或每次上传使用独立版本前缀。

推荐按版本目录上传，再修改 `STATIC_ASSET_BASE_URL`。旧版本目录需保留，已打开网页可能仍会请求旧脚本依赖。上传完成后再切换服务配置。回退时清空该配置并重启，容器内资源仍可用；未配置自动故障回源，避免资源故障被隐藏或产生重复下载。

Vite 的相对 base 使构建资源相对所在文件解析，参见 [Vite 构建文档](https://vite.dev/guide/build#relative-base)。跨域设置可参照 [腾讯云 COS 文档](https://cloud.tencent.com/document/product/436/13318)。无论选择何种存储服务，都应以实际响应头和手机加载结果验收。

## 本地检查

`tests/static-assets.test.mjs` 启动独立资源域名，检查两个主题加载完成、字体与音乐跨域读取、游戏和日历脚本、分享图前缀及 API 同源边界。它不替代对实际存储服务 CORS、缓存规则、HTTPS 证书和微信内访问的验收。

两套歌单的文件编号、仅音乐导出和缓存规则见 [两套主题歌单](music.md)。
