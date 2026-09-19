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

当前只提供了原有的 Close to You，已移至默认主题目录。中式目录没有曲目时沿用默认歌单；放入中式音乐后使用独立歌单。默认目录至少保留一首。删除或移动文件后，应重新构建或导出清单。

## 播放方式

打开后从当前主题第一首开始。曲目播完进入下一首，最后一首播完回到第一首。点击右上角音乐按钮暂停，再点击时切换到下一首并从头播放。只有一首时从这首开头重新播放。

播放被浏览器阻止后，再点击会重试当前选中的曲目，不会跳过它。进入默契挑战和返回页面继续使用原播放器。

加载页等待当前主题的全部曲目完成下载与校验。另一主题的音乐不会一并下载。歌曲顺序下载与解码，避免多首解码同时占用内存；播放使用压缩音频 Blob。增加曲目会增加初次加载时长、访客流量和设备缓存占用。没有转码、压缩或降低现有音乐质量。

## 部署到自带服务器

添加曲目后执行 `npm run build`。构建会按目录生成 `dist/music/classic/playlist.json` 与 `dist/music/chinese/playlist.json`。提交代码和音乐后部署，服务器即可提供歌单。

## 上传静态服务

完整资源包：执行 `npm run build`、`npm run static:export`，导出目录包含 `music/`。压缩并上传目录内的 `assets/`、`share/`、`vendor/`、`music/`。

只更新音乐：执行 `npm run music:export`，会生成独立的 `music-upload/时间戳/music/`。将导出目录中的 `music/` 上传到 `STATIC_ASSET_BASE_URL` 对应目录。先上传音频，再更新两个 `playlist.json`；网页读取清单，不依赖服务器列目录。

例：配置 `STATIC_ASSET_BASE_URL=https://static.example.com/wedding/v1/` 后，歌单地址应为 `https://static.example.com/wedding/v1/music/classic/playlist.json`。仅将曲目文件上传到存储而未更新清单，网页不会知道新增了歌曲。

`playlist.json` 使用 JSON 类型和 `Cache-Control: no-cache`；音频使用对应 MIME。自动生成的曲目 URL 带内容版本参数 `v`，静态服务/CDN 应将该参数纳入缓存键，或更换文件名更新音乐。CORS 须允许请柬域名读取清单和音频，配置参考 [静态资源托管](static-hosting.md)。

保留自带服务器默认方式：`STATIC_ASSET_BASE_URL` 留空。使用外部静态存储时，清单和音频都从该地址读取；外部资源失败会显示加载重试，不假装已准备好。
