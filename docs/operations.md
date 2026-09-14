# 上线与运行维护

## 1C2G、1–2 实例的连接预算

生产 PostgreSQL 的 max_connections 为 100。每实例有祝福池、游戏池和一个 LISTEN 连接。默认 WEDDING_MAX_INSTANCES=2、WEDDING_DB_CONNECTION_BUDGET=80、BLESSINGS_DB_POOL_SIZE=3。单池实际上限取申请值与总预算推导值中的较小值。

2 × (3 + 3 + 1) = 14 个常态连接上限。剩余连接用于管理、其他客户端及重连。启动日志 service.started 的 counts 显示实际预算。滚动发布允许额外实例时，须把额外数量计入 WEDDING_MAX_INSTANCES，或限制平台的额外实例数；应用无法控制平台实例上限。

所有实例使用同一数据库、房间、身份加密密钥和会话密钥。写入、答卷领取、结算、核销和运营清理使用 PostgreSQL 事务与约束；聊天及判题使用持久租约。外部 AI 和短信调用不占用数据库事务。SSE 通知只是唤醒信号，补读以持久数据为准，不要求粘性会话或 Redis。

## DeepSeek 容量

2026-09-13 核对的 [DeepSeek 官方并发说明](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit/)给出 deepseek-flash 每账户 2500 并发。请求发出至响应结束占一个并发。同账户下的 API Key 共享配额，新增 Key 不扩容。

按该配额，100 位宾客无需增加现有 Key；前提是账户其他业务没有占满额度。此结论不保证供应商延迟、余额或网络可用性。正式题库和真实网络仍需试运行验收。

GAME_AI_CONCURRENCY 默认每实例 32 个任务，2 实例为 64 个任务。现有环境变量显式设置为 8 时仍按 8 执行，需修改配置后重启。一个任务的审查、仲裁、主持生成与回应核对按依赖顺序执行，调用次数不等于同时占用数。祝福润色也计入同一共享模型预算。

GAME_AI_MAX_INFLIGHT 默认 120；GAME_AI_ACCOUNT_SCOPE 默认 deepseek-main。同账户各实例须使用相同 scope 与预算。共享数据库租约限制在途模型请求，429/503 的冷却时间跨实例生效。请求边界最多重试三次，35 秒总预算内遵守 Retry-After；聊天遇到可重试失败会保留原提交时间并延后处理，连续失败保留重试入口，不把限流判为答错。

## 试运行数据清理

后台“试运行数据清理”供管理员执行。部署新版本不触发清空。

1. 打开“核对数据”查看本场业务数量。
2. 点击“暂停互动”，阻止新祝福、登录申请和游戏任务领取。等待在途外部调用结束，再次核对。
3. 确认范围，输入“清空试运行数据”和当前管理员密码。点击清空。
4. 点击“结束清理，恢复互动”。进入游戏设置开放正式活动。

删除范围：祝福与礼物、润色记录、宾客身份与登录、验证码与图形票据使用记录、聊天、答卷、人工复核、奖品及核销记录。题库、奖项设置、公开现场资料、配置历史、管理员安全记录、运营审计保留。当前题目已审定的公开素材复制至新版本。

清理在一笔事务内完成，预览过期或有在途任务时拒绝执行。操作编号保证请求重试不再次删除新数据。清理提升本场 generation；旧页面的待发祝福不会回填，新页面使用新代次。旧登录失效，活动回到未开放状态。系统不提供删除后的撤销。

## 容器日志与链路

LOG_LEVEL 默认 info，可设 debug/info/warn/error/silent。正式环境不要使用 silent。warn/error 输出至 stderr，其余输出至 stdout；默认输出可读文本，交给云托管的容器日志采集。没有额外文件日志或本地磁盘依赖。

LOG_FORMAT=text 使用 `[时间] [级别] [服务] [实例] [trace_id] [span_id] - 事件 key=value`。LOG_FORMAT=json 保留单行 JSON，供结构化采集使用。LOG_SERVICE 默认 wedding；LOG_COLOR=auto 按终端能力着色，always 强制着色，never 禁用颜色。容器采集平台不支持 ANSI 时使用 never。NO_COLOR 在 auto 模式下关闭颜色。错误堆栈缩进到后续行；日志平台需按 `[` 开头的时间行聚合多行。字段中的控制字符转义，不能插入假日志。

字段包括时间、级别、事件、实例标识、构建版本、trace_id、span_id、parent_span_id、request_id、任务编号、活动与参与者编号、阶段、耗时、模型、调用次数、Token 数和错误码。HTTP 接收并校验 W3C traceparent，生成当前请求 span，响应返回 traceparent 和 X-Request-ID。异步聊天/答卷保存原 trace_id；领取任务的实例沿用链路并生成子 span，模型调用再生成子 span。

排查从 X-Request-ID 或 trace_id 开始：

- http.complete：请求路径、状态和耗时。成功静态资源默认不记录；LOG_HTTP_ASSETS=true 可临时开启。
- conversation.accepted、job.started：入库标识、处理实例、排队时间。
- conversation.routed、conversation.stage：意图与处理阶段。
- ai.started、ai.completed、ai.failed、ai.retry、ai.admission_wait：模型调用、Token、耗时、限流退避和配额等待。
- answer.finished：答卷版本、判定结果或过期租约结果。
- blessing.saved、game.settled、game.redeemed：保存、结算、核销或重放状态；不记录兑奖码。
- conversation.deferred、conversation.reply、job.failed、job.finished：延后、回复来源、失败与本次处理结束。job.finished 不代表业务已成功，须检查同链路的结果事件。
- sms.requested、sms.delivery、sms.verified：发送挑战编号、结果状态和核验结论。
- db.transaction_failed、db.transaction_slow、连接故障事件：数据库异常、锁竞争及连接中断。
- admin.login、admin.logout、room.reset：管理员身份操作与清空结果。运营审计记录保存在 wedding_operation_audit。

日志不包含密码、密钥、Cookie、验证码、手机号、请求正文、宾客回答或模型提示词。异常保留错误类型、代码及调用栈位置，剔除错误消息原文。需要查看答题原文时，凭参与者或任务编号进入受保护的后台记录；不在日志平台扩散宾客内容。

管理员登录限流及 Cookie 撤销由数据库共享。跨实例退出生效，负载均衡切换不会重置失败次数。

## 验证与发布

先执行 blessings:migrate 与 game:migrate，再发布应用代码。迁移是新增表、列、索引及幂等奖项政策检查，不执行暂停、清空或核销。发布期间新旧实例并存时，不操作清理面板；待平台全部实例换成当前版本后使用。

隔离 PostgreSQL 和浏览器回归覆盖共享登录限流、跨实例消息、暂停/清空、旧请求重放、模型限流恢复、奖品与手机导航。多进程压力验证入口为 tests/cluster-load.mjs --run，需要 BLESSINGS_TEST_DATABASE_URL 指向本机隔离数据库，禁止指向正式库。

[压测记录](cluster-load-report.json)使用 5 个真实 Node 进程、100 个测试会话、250 ms 延迟的本机模型替身。测试模型预算故意收紧至 12，检查共享预算与恢复行为。它不证明 DeepSeek 实际响应时间或生产云主机承载量。

压测冷启动资源清单约 15.37 MB/人，100 人约 1.54 GB，其中完整背景音乐约 9.75 MB；清单不包含全部字体分片。这部分吞吐与 API Key 无关。生产验收需检查静态资源缓存/CDN命中和出站带宽，动态 HTML、登录、聊天与 SSE 不应被页面缓存。

[真实模型回归](game-cluster-ai-evaluation.json)记录 17 轮虚构对话，17 轮行为检查通过且使用已核对的生成回复。样本覆盖规则、公开日程、手机号用途、已完成后的现场助手与注入指令，不构成正式题库准确率承诺。

静态资源导出与运行时地址配置见 [静态资源托管](static-hosting.md)。1C2G 容器的实测与限制见 [容量评估](runtime-capacity.md)。
