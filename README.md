# 婚礼电子请柬

## 工程目录

| 目录 | 内容 |
| --- | --- |
| `src/` | 请柬、音乐、祝福和游戏的前端代码与样式 |
| `server/` | HTTP、数据库、认证、AI 和后台服务 |
| `public/` | 正式公开资源；相对于此目录的路径就是请求路径 |
| `design/` | 当前图片的原照、设计源稿、蒙版、生成记录和重建脚本 |
| `build/` | 构建与歌单同步工具 |
| `tests/` | 行为、浏览器与资源契约检查 |
| `docs/` | 使用、部署说明和已引用的验证记录 |
| `dist/` | `npm run build` 生成的服务产物，不提交 Git |
| `.temp/` | 试制素材、截图、日志、缓存、测试夹具和临时导出，不提交 Git、不进入镜像 |

`node_modules/` 是依赖目录，`.env.*.local` 是本地运行配置；二者不进入 Git。正式构建和服务不读取 `.temp`。

## 正式资源目录

```text
public/
  assets/
    classic/       默认主题图片；alternatives/ 保留现有封面参数所用素材
    chinese/       中式主题图片
    shared/        标志、花瓣、礼物与奖品图集
    fonts/         按字体家族归类；welcome/ 是开场内嵌字形
  music/
    classic/       默认主题音频与 playlist.json
    chinese/       中式主题音频与 playlist.json
  share/           分享缩略图
  vendor/          浏览器第三方组件
```

图片与字体不再由构建工具改成另一套文件名或扁平目录。例如：

| 文件位置 | 站点请求路径 |
| --- | --- |
| `public/assets/chinese/portrait.webp` | `/assets/chinese/portrait.webp` |
| `public/assets/classic/location.jpg` | `/assets/classic/location.jpg` |
| `public/music/classic/01-曲名.mp3` | `/music/classic/01-%E6%9B%B2%E5%90%8D.mp3` |

中文、空格按 URL 编码发送，服务器解码后仍对应同一个文件名。配置外部静态服务时，只在这些路径前增加 `STATIC_ASSET_BASE_URL`，目录与文件名保持不变。

`public/` 根目录的域名验证文件、隐私页和日历文件具有本站固定访问地址。上传整个 `public` 的内容时可以保留这些文件；网站继续提供原有地址。

## 开发与发布

```shell
npm ci
npm run dev
npm run build
npm start
```

服务端配置示例为 `.env.server.example`、`.env.blessings.example`、`.env.game.example` 和 `.env.admin.example`。真实凭据写入本地环境文件或云托管配置。

静态资源服务接收 `public/` 内的全部内容，保留目录、文件名与文件内容。上传根目录应出现 `assets/`、`music/`、`share/`、`vendor/`，不加一层 `public/`。网站的运行环境配置如下：

```dotenv
STATIC_ASSET_BASE_URL=https://static.jaryn.com.cn/
```

重启网站服务后，素材从该域名读取。配置留空时使用网站自带素材。应用 JS/CSS、HTML、登录、实时接口和后台由网站提供；静态资源上传不依赖 `dist/` 或导出命令。

增删音乐或替换音频文件后，执行 `npm run music:sync` 更新 `public/music/*/playlist.json`，上传 `public`。`npm run dev` 和 `npm run build` 会执行相同的歌单同步。

- [静态服务配置与上传顺序](docs/static-hosting.md)
- [两套音乐歌单与音乐更新](docs/music.md)
- [运行维护](docs/operations.md)

制作过程的临时文件写入 `.temp/`，例如 `.temp/screenshots/`、`.temp/reports/`、`.temp/uploads/`。需要重建正式素材的原照、设计源稿和脚本保存在 `design/`。`docs/` 保存使用说明及已引用的验证记录，评测脚本的新输出写入 `.temp/reports/`。

`.temp/archive/` 包含本地保留的试制文件；它不属于发布资源，也不代表文件已备份到远端。
