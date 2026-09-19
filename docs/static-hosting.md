# 静态资源托管

将 `public/` 内的内容原样上传到静态服务，网站配置 `STATIC_ASSET_BASE_URL`。图片、音乐、字体、分享图和第三方浏览器组件使用静态服务地址。

## 上传与配置

1. 将 `public/` 内的全部内容上传到静态服务根目录，保留内部目录结构、文件名和字节内容。
2. 为该服务配置 HTTPS 域名，例如 `static.jaryn.com.cn`。
3. 在网站运行环境设置 `STATIC_ASSET_BASE_URL=https://static.jaryn.com.cn/`，重启网站服务。

上传根目录示例：

```text
assets/
music/
share/
vendor/
privacy.html
wedding.ics
域名验证文件.txt
```

ZIP 的第一层应是这些目录和文件。额外包一层 `public/` 会改变请求路径。上传无需执行应用构建或资源导出。

| 本地文件 | 静态服务请求地址 |
| --- | --- |
| `public/assets/chinese/portrait.webp` | `https://static.jaryn.com.cn/assets/chinese/portrait.webp` |
| `public/assets/fonts/cinzel/8vIJ7ww63mVu7gt7-GT7LEc.woff2` | `https://static.jaryn.com.cn/assets/fonts/cinzel/8vIJ7ww63mVu7gt7-GT7LEc.woff2` |
| `public/music/classic/playlist.json` | `https://static.jaryn.com.cn/music/classic/playlist.json` |

域名前缀支持目录。例如 `STATIC_ASSET_BASE_URL=https://static.jaryn.com.cn/wedding/` 对应将 `public` 的内容上传到远端 `wedding/`。中文与空格使用 URL 编码，文件名保持原值。

## 网站与静态服务的职责

网站提供 HTML、编译后的 `app/` JS/CSS、接口、登录、实时连接和后台。`public/` 根目录的隐私页、日历和域名验证文件保留本站访问地址；它们出现在静态服务上不影响本站地址。

服务启动时将 CSS 中的图片与字体 URL 指向静态服务。CSS 请求地址包含静态配置的指纹，配置变化会触发浏览器获取新样式。磁盘中的构建文件保持原值，切换域名无需重新构建应用。

开场预览图、开场字形与标志保留现有 HTML 内嵌方式，首帧可在脚本与样式下载前显示。页面使用的完整素材从静态服务读取。

`STATIC_ASSET_BASE_URL` 留空时，网站使用自身构建产物携带的资源。清空配置并重启服务可以恢复此方式。外部资源加载失败会显示重试状态，不会触发素材回源下载。

## 更新资源

图片与字体更新后，上传对应的 `public` 文件。文件名固定的资源需要缓存验证或 CDN 刷新。

音乐清单属于 `public`。增删曲目或替换音频内容后执行：

```shell
npm run music:sync
```

该命令更新 `public/music/classic/playlist.json` 和 `public/music/chinese/playlist.json`。开发启动与应用构建会执行相同同步。上传顺序为音频文件、歌单文件。只更新音乐时可上传 `public/music/`，无需发布应用。

## 静态服务设置

- 使用允许公开读取的 HTTPS 地址。
- CORS 允许来源 `https://wedding.jaryn.com.cn`，方法 `GET`、`HEAD`；请求头允许 `Range`，暴露 `Content-Length`、`Content-Range`、`Accept-Ranges`。试运行域名需加入允许来源。
- 保持文件 MIME：JSON 为 `application/json`，WOFF2 为 `font/woff2`，MP3 为 `audio/mpeg`，WebP 为 `image/webp`，第三方 JS 为 `text/javascript`。
- 音频支持字节范围请求。
- 固定文件名的素材与歌单使用 `Cache-Control: no-cache` 验证更新。音乐 URL 的 `v` 参数应纳入 CDN 缓存键。

## 验证范围

`tests/resource-layout.test.mjs` 核对 `public` 歌单与音频一致，核对 `public` 与 `dist` 的公开文件路径及字节内容。

`tests/static-assets.test.mjs` 使用只提供 `public` 的独立服务验证两个主题、CSS 背景、字体、音乐、分享图、游戏页和日历页，并检查应用与 API 的本站边界、配置切换和 CSS 缓存校验。

本地测试不代表真实服务已部署。实际服务需要核对域名、HTTPS、CORS、缓存与微信内访问。
