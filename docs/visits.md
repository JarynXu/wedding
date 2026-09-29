# 请柬访问统计

后台“运行状态”顶部的“请柬访问”显示累计访客、今日访客、累计打开次数、今日打开次数、近两分钟活跃访客、近七天访客趋势，以及浏览器和设备来源。后台每 30 秒更新一次，也可手动刷新。天数按北京时间划分；来源和设备占比按累计打开次数计算。

访客表示一个浏览器中的匿名编号，不代表经过身份验证的自然人。同一浏览器刷新或再次打开会增加打开次数，不重复增加累计访客。换浏览器、换设备、清除网站存储或浏览器自动清理存储后，可能会计为新访客。不能依靠相同的微信版本、手机型号或 IP 把不同访客合并。

## 记录范围

只有可见的顶层请柬页面上报访问，素材请求、管理后台、内嵌的游戏和日历不计入打开次数。初次上报发生在进入请柬按钮之前；页面加载到 JavaScript 执行前就被关闭的访问无法统计。常见爬虫、预览和自动化 User-Agent 会被过滤，但这不构成真人验证。浏览器发出 GPC 或 DNT 拒绝跟踪信号时，不进行上报。

一个文档使用一个随机访问编号，网络重试沿用该编号，数据库唯一约束避免重复计数。页面回到前台或从浏览器快照恢复时只更新活跃时间；刷新生成新的访问编号。页面可见时每 30 秒发送一次心跳，隐藏后暂停；“最近活跃”按最近两分钟的去重访客计算，不等同于精确的实时在线人数。

`localStorage` 优先保存随机访客 UUID。存储不可用时，退到 `sessionStorage`，再退到页面内存；同站签名 Cookie 在这两种降级情形下帮助跨次识别。浏览器支持 Web Locks 时，首次创建编号通过锁避免多标签页竞争。长期存储可用但编号已删除时会创建新编号，不用 Cookie 恢复已清除的编号。

## 数据与权限

服务端用 `HMAC-SHA-256` 和婚礼 room 处理访客编号后再保存，复用服务端 `BLESSINGS_RATE_SECRET` 并使用独立用途前缀。原始访客 UUID 不写入数据库。Cookie 使用签名、`HttpOnly`、`SameSite=Lax`，路径限于 `/api/visits`，保留 180 天；HTTPS 站点同时设置 `Secure`。

两张独立表 `wedding_visitors` 和 `wedding_visits` 保存摘要标识、随机访问编号、访问时间、主题、浏览器分类和设备分类，不保存原始 User-Agent、IP、姓名、手机号、完整网址或查询参数，也不关联祝福、答卷和登录身份。统计采用本站服务，不安装第三方统计脚本。摘要属于可关联重复访问的匿名代号，并非数据库加密或身份认证。

`POST /api/visits` 校验同站 Origin、JSON 大小和字段类型；每个访客每分钟最多记录 60 次打开。心跳至少间隔 20 秒才写入时间。`GET /admin/api/visits` 需要现有后台登录，只返回汇总，不返回访客标识或逐条访问记录。统计读取失败时显示不可用，不伪造为零。

## 启用和验证

随现有 Node 服务部署；已配置祝福数据库时自动启用并复用其连接池，不新建额外连接池。首次访问或读取统计时，通过事务和跨实例锁创建独立统计表及索引，不改动原有祝福、游戏或登录表。仅重置活动或问答数据不会清除访问统计。未配置数据库时显示“访问统计尚未启用”。统计从新版服务和前端上线后开始，不能补记之前的访问。

本地验证使用隔离的 PGlite PostgreSQL 引擎，不连接生产数据库。将 `PGLITE_MODULE_PATH` 指向 `@electric-sql/pglite` 模块目录，浏览器测试另需设置现有的 `PLAYWRIGHT_MODULE_PATH` 和 `PLAYWRIGHT_CHANNEL`：

```powershell
node --test tests/visits.test.mjs tests/visits-browser.test.mjs
```

设计参考：[Google 的 Cookie 与用户识别](https://developers.google.com/tag-platform/security/concepts/cookies)、[Microsoft Clarity 的匿名编号用途](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies)、[MDN Cookie 存储与清除行为](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)。本项目只采用匿名编号与汇总统计的做法。
