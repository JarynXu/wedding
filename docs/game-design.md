# 默契挑战

## 活动规则

默认六道题，答对至少两题达标。截止时间是北京时间 2026 年 10 月 16 日结束，即 `2026-10-17T00:00:00+08:00`。名额上限为 20 人，前三名各有一份大奖，其余最多 17 人领取参与奖。不足 20 人达标时按实际人数发放，不为凑数制造获奖者。

每题一次正式提交，网络重试使用原请求标识。按达到两题正确的服务端接收时间取最早的 20 人，再在此名单内按正确题数降序、达到该成绩的接收时间升序排名；精确时间相同时用接收序号排序。AI 返回速度不作为排名依据。

截止前成绩与榜单标为暂定。截止后完成所有待判定、待复核答卷，管理员核对名单并结算。结算请求绑定名单和答卷版本快照；任何复核改变快照后，旧确认失效。结算以数据库事务和唯一奖位为约束，并发请求不会增加奖项。兑奖码只能由已结算记录产生，工作人员在后台查询、核对领取者并核销，同一码只完成一次领取。

## 后台管理

地址 `/admin`，进入“默契游戏”。可编辑题目、标准答案、别称、评分依据、判题补充说明、截止时间、名额和奖项名称。正式题库默认留空，不使用编造的新人经历。题库或短信、图形认证、AI 接口未配置时不能开放。

活动未结算前修改题目或评分依据，会将受影响的既有答卷重新送审，保留原文和原始接收时间。后台可查看参与者、两个模型的判定、引文、人工复核记录，并纠正已经判对或判错的回答。规则版本与旧配置保存在数据库。结算后锁定题目和奖项，避免已签发凭据与名单矛盾。

## 认证与 30 天会话

使用阿里云号码认证服务的短信认证。短信发送调用 `SendSmsVerifyCode`，由阿里云生成六位验证码；核验调用 `CheckSmsVerifyCode`。业务接口 `OK` 不等于核验通过，必须取得 `Model.VerifyResult=PASS`。该 API 的 `UNKNOWN` 定义为核验失败；网络异常、业务失败和未声明结果不允许登录。

获取验证码前，宾客同意登录说明并通过图形验证。客户端使用用户提供的 `ct4.js`，服务端使用 AppKey 生成 HMAC 签名，调用 `https://captcha.alicaptcha.com/validate` 做二次校验，成功结果还需匹配验证流水号。供应商超时或异常时不放行。数据库的图形票据唯一约束和验证码请求唯一标识阻止同一票据重复触发短信。

图形验证成功后、验证码请求入库前发生进程中断时，原图形票据可能已被供应商消费；此时需重新完成图形验证。本系统不声称供应商核验只有一次，约束的是重复请求不能多发短信。短信发送结果未知时保留挑战记录，收到验证码仍可核验。

发送限额：每个手机号间隔 60 秒、每小时最多 5 次，每个来源网络每小时最多 100 次，活动的短信请求总量默认每日 300 次（可通过环境变量调整每日上限）。图形票据不代替这些限额。单个验证码最多 5 次核验尝试，核验过程有租约，成功后不可重用。

同一手机号对应同一参赛记录。验证码通过后生成随机会话，数据库保存摘要与 30 天有效期，Cookie 使用 HttpOnly、SameSite=Strict，生产环境使用 Secure。有效会话在同一浏览器中不重复请求图形认证或短信；退出、清除 Cookie 或更换浏览器后需要重新验证。手机号加密存储，公开榜单只展示称呼与成绩。手机号控制权不等于自然人唯一，现场核对仍有作用。

`numberAuth-web-sdk.js` 属于号码一键登录/本机号码校验，当前短信认证不使用它，不要求宾客关闭 Wi-Fi。保留的图形 SDK 位于 `public/vendor/aliyun-graph/ct4.js`，来源与 SHA-256 记录在同目录。

## AI 与权限

服务端只将当前可信题目、标准答案、别称、评分依据与本次回答交给模型，排除昵称、URL 参数、祝福和其他来宾上下文。判题模型与复核模型独立评阅，不转发第一个模型的自由文本理由。返回值只允许“正确 / 错误 / 待复核”、依据与回答原文片段。

模型没有工具、数据库权限、库存、会话凭据或兑奖码。格式错误、引用不存在、两次判断不一致、疑似指令控制或服务异常时转人工复核，不视为答错或自动获奖。后台保存模型与人工依据。两个阅卷调用使用 DeepSeek `deepseek-flash`，各自接收题目与回答；同一模型可能产生相同误判。结构化输出不保证语义判断不受欺骗，最终获奖候选须人工核对。

DeepSeek 适配使用 JSON Output、关闭思考模式，每次最多 800 个输出 token，超时为 35 秒。截断响应不参与计分。供应商协议由 `model-client.js` 承担；`openai-compatible` 适配使用 JSON Schema。

## 服务端部署

1. 配置已有 PostgreSQL 连接（`BLESSINGS_DATABASE_URL` 等）和后台凭据。
2. 参考 [.env.game.example](../.env.game.example) 设置游戏配置。`GAME_DATA_KEY` 是 32 字节十六进制密钥，用于手机号和兑奖码，须保留备份；更换前需要迁移加密数据。`GAME_SESSION_SECRET` 使用独立随机值，所有实例保持一致。
3. 将阿里云 AccessKey、签名、模板 Code、图形 AppID/AppKey 配置在服务端。不要加 `VITE_` 前缀，不要提交到 Git。
4. 配置 `GAME_AI_PROVIDER=deepseek`、`GAME_AI_BASE_URL=https://api.deepseek.com`，判题和复核模型均使用 `deepseek-flash`。密钥只放在服务端私有环境配置。示例文件不包含真实密钥。
5. 执行 `node --env-file=私有环境文件 server/game/migrate.js`，再构建和重启服务。首次启动会创建本场活动的空题库草稿。
6. 在后台填写六道题与标准答案，检查集成配置，再开放活动。请柬最后一页会出现游戏入口，`/game.html` 可查看游戏及个人兑奖凭据。

游戏复用 PostgreSQL，不需要 Redis。游戏进程增加一个最多 5 条连接的池，每实例最多同时处理 3 个答案，外部 AI 调用不占用数据库事务；两个模型调用并发进行。90 秒判题租约可由其他实例恢复。后台关闭、数据库或模型失败均不会降级为虚构成绩。

## 验证范围

隔离 PostgreSQL 测试覆盖手机号身份、图形票据重放、短信请求去重、30 天会话、题目重判、过期判题租约、名单快照、8 次并发结算只产生一份奖位清单、10 次并发核销只领取一次，以及未登录/越权访问。浏览器测试覆盖双主题手机登录、六题流程、响应丢失后的恢复、榜单、结算与兑奖状态。

短信、图形与 AI 的外部协议回归测试使用明确的替身。真实短信送达、宾客完成图形验证与正式云托管连通尚未验收。不得把测试环境指向正式宾客数据库。

DeepSeek 真实接口评测使用 12 条虚构城市题回答：4 条正确表达、4 条错误或含糊表达、4 条控制评审的文字。结果为 12/12 符合预期，其中 2 条由本地规则转人工复核，10 条产生 20 份模型响应。10 条双阅卷请求耗时为 0.814–1.550 秒。此结果只覆盖该样本与测试网络，不表示正式题库的准确率或速度承诺。六道正式题填写后仍需核对别称、歧义和评分依据。

样本与执行入口为 `tests/evaluate-game-ai.mjs`，结果见 [DeepSeek 评测记录](game-ai-evaluation.json)。该脚本不参与默认测试，需要 `--live` 参数与私有密钥；每次执行会产生真实 API 调用费用。

## 接口依据

- [阿里云短信认证接入](https://help.aliyun.com/zh/pnvs/user-guide/sms-authentication-service)
- [发送短信验证码](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)
- [核验短信验证码](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-checksmsverifycode)
- [图形认证 H5 SDK](https://help.aliyun.com/zh/pnvs/developer-reference/integrate-the-sdk-with-h5-pages)
- [图形二次校验](https://help.aliyun.com/zh/pnvs/developer-reference/graphical-authentication-server-integration)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [OpenAI 结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)
- [限制提示词注入的影响范围](https://openai.com/index/designing-agents-to-resist-prompt-injection/)
