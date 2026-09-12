# 管理后台

后台地址为 `/admin`。运行面板提供服务状态、构建信息和祝福统计；“默契游戏”提供题库、规则、答卷复核、获奖结算和现场核销。后台不提供祝福编辑或删除操作。

游戏配置与验收边界见[默契挑战说明](game-design.md)。游戏集成区域显示短信、图形认证和 AI 的配置状态；“已配置”不代表供应商服务已完成真实调用验证。

## 服务端配置

复制 [.env.admin.example](../.env.admin.example) 为未跟踪的本地配置，或将对应变量写入云托管服务端环境变量。密码只以 `scrypt$N$r$p$salt$key` 哈希形式配置：

```powershell
$env:ADMIN_PASSWORD = '待生成哈希的密码'
node --input-type=module -e "import { hashPassword } from './server/admin/password.js'; console.log(await hashPassword(process.env.ADMIN_PASSWORD))"
```

生产环境设置 `ADMIN_COOKIE_SECURE=true`。本地 HTTP 测试设置 `false`。所有实例必须使用相同的 `ADMIN_SESSION_SECRET`，这样签名会话可以在实例之间验证。

`npm run build` 会在 `dist/.build-info.json` 写入构建时间和源码内容指纹。服务读取该文件展示构建标识。`APP_BUILD_COMMIT` 有值时优先展示部署提供的提交标识；未提供时不会把 package 版本当作提交 SHA，构建指纹或未知状态按实际情况展示。构建指纹不读取 `.env` 文件。

## 会话与统计范围

会话 Cookie 使用共享密钥签名，不存储在进程 Map 中，默认有效期为 8 小时。退出登录会让当前浏览器清除 Cookie。无状态会话没有跨实例撤销表，旧 Cookie 在有效期内仍能通过签名验证；丢失 Cookie 后应等待过期或轮换 `ADMIN_SESSION_SECRET`，轮换会使所有旧会话失效。

登录失败限额按服务实例内的来源地址计数。它限制单个实例的在线尝试，不冒充跨实例的全局限额；全局限额需要共享存储。

祝福累计数量和最近保存时间来自配置的共享 room。SSE 连接数只来自当前 Node.js 实例的连接集合。多实例部署时，后台不会把实例连接数汇总为全局在线人数。
