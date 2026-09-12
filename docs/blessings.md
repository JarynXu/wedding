# 宾客祝福

祝福从迎宾页开放，四页共用左下角入口。入口右侧展示本主题的快捷礼物，点按可送出，不附带尚未提交的文字；翻页按钮位于底部右侧。宾客可在面板中写下 120 字内的祝福、填写 24 字内的称呼、选择一件礼物。称呼为宾客自填，不代表微信实名。礼物没有价格与购买流程。祝福簿向访问请柬的宾客开放，界面会提示此范围。

法式主题提供玫瑰、香槟和烟花；中式主题提供烟花、喜灯、同心结和双喜。两套主题与双方父母链接共用 `BLESSINGS_ROOM`，更换 URL 参数不会拆分祝福簿。

快捷礼物点按时在本机播放，不等待接口。按住 350 毫秒后开始连续播放，后续间隔为 450 毫秒；松手将本次播放数量作为一条记录提交，祝福簿显示“礼物 × 数量”。同一手势最多计数 999 次。指针取消、窗口失焦或页面转入后台会停止长按。

播放次数与保存次数分开。前端按服务端间隔和每分钟条数控制记录请求，默认间隔 5 秒；已有请求未返回时不并发提交快捷礼物。超限操作仍在本机播放，省略该次祝福簿记录。服务端返回 429 时前端遵守 `Retry-After`，不显示受限或送达提示。其他宾客收到的是已保存记录；未记录的本机效果不广播。

## 云托管配置

需要 PostgreSQL 16 或更新版本。数据库保存消息，`LISTEN/NOTIFY` 唤醒各实例读取消息，不需要 Redis。每个应用实例使用默认最多 5 条池连接与 1 条通知连接。数据库代理须支持会话级 `LISTEN`，不要为通知连接使用事务池代理。

1. 创建数据库与应用账号，允许云托管实例连接。
2. 将 [.env.blessings.example](../.env.blessings.example) 中的配置填入云托管服务端环境变量。数据库密码中的 URI 保留字符需要百分号编码。
3. `BLESSINGS_RATE_SECRET` 使用至少 32 字符的随机值，所有实例保持一致。可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成。
4. 配置 TLS：`BLESSINGS_DB_SSL=true` 使用受信证书；私有 CA 填入 `BLESSINGS_DB_CA_PEM`。TLS 参数不要写入数据库 URI。
5. 使用有建表权限的账号执行 `npm run blessings:migrate`。迁移脚本可重复执行。生产应用账号需要表的 SELECT/INSERT、序列的 USAGE/SELECT 权限。
6. 启动服务。`/api/blessings/config` 返回 `enabled:true` 表示功能已配置；`/api/blessings/stream` 返回 `sync` 事件表示数据库实时链路就绪。

`BLESSINGS_PUBLIC_ORIGIN` 当前为 `https://wedding.jaryn.com.cn`，发送接口校验浏览器 Origin。云托管网关须支持流式响应，关闭 SSE 路径缓存和响应缓冲，允许持续连接。服务每 10 秒发送心跳。网关关闭连接时，客户端使用收到的游标重连。服务器不为每个来宾建立数据库连接。

`BLESSINGS_CLIENT_IP_HEADER` 默认留空，使用直连地址。确认受信网关覆盖请求头后，可配置 `x-original-forwarded-for`。不要信任由访客透传的 IP 头。默认限制：每个浏览器每分钟 12 条、两次发送间隔 3 秒、每个来源网络每分钟 600 条；网络限额考虑同一宴会 Wi-Fi / 网关的共享地址。称呼与随机浏览器标识不具备身份认证能力，限额用于减少重复发送和基础滥用。

未配置数据库，或 `BLESSINGS_ENABLED=false`：接口明确关闭，页面隐藏入口。配置错误导致启动报错。已配置数据库出现故障：请柬继续展示，祝福面板显示重连或发送未确认，不显示虚构消息，不降级为易丢失的内存存储。

## 本地运行

复制示例为未跟踪的 `.env.local`，填写本地数据库与 `BLESSINGS_PUBLIC_ORIGIN=http://127.0.0.1:4175`。本地开发数据库不支持 TLS 时设置 `BLESSINGS_DB_SSL=false`。

```powershell
node --env-file=.env.local server/blessings/migrate.js
npm run build
$env:PORT = '4175'
node --env-file=.env.local server/index.js
```

`npm run dev` 与 `npm run preview` 也读取 `.env.local` 并复用生产 API。运行端口须与 `BLESSINGS_PUBLIC_ORIGIN` 一致。不要将凭据添加 `VITE_` 前缀，不要提交 `.env.local`。

## 保存与重连契约

- `POST /api/blessings` 接受 `requestId`、`clientId`、`name`、`text`、`gift`、`giftCount`、`theme`。UUID 为版本 4。礼物数量是 1–999 的整数，省略时为 1，无礼物时为 0。同一逻辑发送重用 requestId；重复请求返回同一记录。相同键更改文字或数量返回 409。数量是前端播放计数，不代表付费资产或经认证的身份。
- 保存使用事务。提交完成才返回成功或发出通知。按请柬加事务锁，再分配消息序号，保证同一请柬的序号顺序与提交顺序一致。
- `GET /api/blessings/history?before=序号` 按时间倒序读取，每页 30 条。历史时间来自数据库。数据库不保存原始 IP 或浏览器标识，只保存其 HMAC 摘要用于限额。
- `GET /api/blessings/stream?after=序号` 使用 SSE；`Last-Event-ID` 优先。`sync` 为历史/重连快照，`blessing` 为新消息。首次快照最多 6 条。重连缺口超过 200 条时返回最近快照及 `reset:true`；完整记录仍可通过祝福簿读取。
- 同一实例共用通知监听和游标读取；每 4 秒补读可恢复遗漏通知。新连接先订阅更新，再读快照，排除并发重复。历史快照不重播礼物特效。
- 消息队列最多 12 条，同屏气泡最多 2 个，每条约 7 秒。高并发时省略视觉队列中的旧消息，数据库记录不删除。礼物使用一个画布和动画循环，最多绘制 10 个实例；新操作进入画面时释放超额的最早实例。切到后台会关闭 SSE、清理视觉队列；返回后补读记录。
- 网络超时不能证明发送失败。浏览器保留待确认请求；点击重试使用同一 requestId。存储被禁用时，待确认内容只存在当前页面内存。只有服务端确认保存的消息才进入发送成功状态。
- 界面使用 `textContent` 展示宾客文字。祝福默认实时显示，面板不展示连接状态行、标题装饰或飘屏开关。保留系统减少动态效果、键盘操作与模态焦点返回。发送和历史面板共用固定外框高度，标签页采用 160 毫秒淡入位移，减少动态效果时直接切换。主题滚动条位于各自内容区。
- 气泡在左侧升起，礼物在右侧播放。礼物的火花与光晕受轨迹边界约束，不进入气泡区域。快捷礼物和文字发送分别保留待确认请求，重试不附带草稿或重复保存。
- 快捷礼物通过回传的 `requestId` 识别本机已播放记录，HTTP 确认和 SSE 回声不会重复播放。网络结果未知时保留原数量与请求标识，下次允许记录时核对旧请求；新操作仍播放，界面不宣称旧记录已送达。

升级前执行 `server/blessings/migrate.js`，增加 `gift_count` 列，已有记录按单份礼物读取。单份礼物沿用旧请求指纹，部署前的待确认请求可重试。

## 维护与验证

数据库备份由部署方配置。消息保留至维护者删除；隐藏入口不会删除记录。`server/blessings/schema.sql` 给出表结构，维护者可使用数据库管理工具导出与删除指定记录。删除记录前保留备份；删除行为不会向已打开页面广播。

自动化测试使用隔离数据库，禁止指向真实宾客数据：

```powershell
$env:BLESSINGS_TEST_DATABASE_URL = 'postgresql://账号:密码@127.0.0.1:端口/测试库'
node --test --test-concurrency=1 tests/blessings.test.mjs tests/blessings-browser.test.mjs tests/gift-effects.test.mjs
```

浏览器测试需要 `PLAYWRIGHT_MODULE_PATH` 与 `PLAYWRIGHT_CHANNEL`，图片回归需要项目既有的 `SHARP_MODULE_PATH`。数据库测试覆盖迁移、跨实例发送、重复请求、分页、断线补读、连接恢复和失败状态。故障测试会临时改名测试表，须使用独立测试库。

基础协议来源：[PostgreSQL LISTEN](https://www.postgresql.org/docs/current/sql-listen.html)、[node-postgres 事务](https://node-postgres.com/features/transactions)、[CloudBase 网关 FAQ](https://docs.cloudbase.net/run/faq/gw)。云端真实微信网络、网关超时和数据库部署仍需上线联调。
