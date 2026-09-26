# 两套主题歌单

默认主题的音乐放在 `public/music/classic/`，中式主题放在 `public/music/chinese/`。

```text
public/music/
  classic/
    01-开场曲.mp3
    02-第二首.mp3
    03-第三首.mp3
  chinese/
    01-喜乐.mp3
    02-良辰.mp3
```

文件名前的数字决定播放顺序。同一编号按文件名排序，未编号的曲目排在后面。支持 mp3、m4a、aac、ogg、wav；手机与微信场景建议使用 MP3 或 AAC 编码的 M4A，具体文件须经过手机播放验证。

当前提供的 Close to You 位于默认主题目录。中式目录没有曲目时沿用默认歌单；放入中式音乐后使用独立歌单。默认目录至少保留一首。增删曲目或替换音频内容后，执行 `npm run music:sync`。

## 播放方式

打开后从当前主题第一首开始。曲目播完进入下一首，最后一首播完回到第一首。点击右上角音乐按钮暂停，再点击时切换到下一首并从头播放。只有一首时从这首开头重新播放。

播放被浏览器阻止后，再点击会重试当前选中的曲目，不会跳过它。进入默契挑战和返回页面继续使用原播放器。跳转日历或导航不主动停歌；宿主中断播放后，返回页面会恢复同一首和原进度。页面被浏览器回收时，从历史记录恢复曲目、进度和播放选择。用户主动暂停后不会自动恢复；自动恢复被宿主拒绝时，下一次页面操作会重试，音乐按钮也保留播放提示。

加载页等待当前主题的全部曲目完成下载与校验。另一主题的音乐不会一并下载。歌曲顺序下载与解码，避免多首解码同时占用内存；播放使用压缩音频 Blob。增加曲目会增加初次加载时长、访客流量和设备缓存占用。没有转码、压缩或降低现有音乐质量。

## 部署到自带服务器

添加曲目后执行 `npm run build`。构建先更新 `public/music/classic/playlist.json` 与 `public/music/chinese/playlist.json`，将公开资源原样复制到 `dist`。网站服务提供 `dist/music` 下的音频与歌单。

## 上传静态服务

全量上传使用 `public/` 内的全部内容，保留内部结构。歌单与音频均在该目录中，不依赖应用构建产物。

只更新音乐：执行 `npm run music:sync`，将 `public/music/` 上传到 `STATIC_ASSET_BASE_URL` 对应目录。先上传音频，再更新两个 `playlist.json`；网页读取清单，不依赖服务器列目录。

例：配置 `STATIC_ASSET_BASE_URL=https://static.jaryn.com.cn/` 后，歌单地址为 `https://static.jaryn.com.cn/music/classic/playlist.json`。仅上传曲目文件会遗漏歌单中的新增记录，网页无法识别新增曲目。

`playlist.json` 使用 JSON 类型和 `Cache-Control: no-cache`；音频使用对应 MIME。自动生成的曲目 URL 带内容版本参数 `v`，静态服务/CDN 应将该参数纳入缓存键，或更换文件名更新音乐。CORS 须允许请柬域名读取清单和音频，配置参考 [静态资源托管](static-hosting.md)。

保留自带服务器默认方式：`STATIC_ASSET_BASE_URL` 留空。使用外部静态存储时，清单和音频都从该地址读取；外部资源失败会显示加载重试，不假装已准备好。
