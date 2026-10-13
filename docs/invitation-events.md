# 宴会类型与邀请链接

`event` 选择宴会，`theme` 选择主题，`side` 与 `parents` 选择家长署名。

| 用途 | 查询参数示例 |
| --- | --- |
| 原婚礼 | 无参数，或 `event=wedding` |
| 回门宴，新人邀请 | `event=huimen` |
| 中式回门宴 | `event=huimen&theme=chinese` |
| 女方父母邀请 | `event=huimen&side=bride&parents=赵先生、李女士` |

`parents` 示例须替换成实际署名。程序生成链接时使用 `URLSearchParams` 编码。回门宴家长署名使用 `side=bride`，正文称谓为“爱女”“女婿”。未知、空值或重复的 `event` 参数返回无效链接；原婚礼链接不受影响。

## 回门宴信息

日期为 2026 年 10 月 25 日，星期日。同一份请柬展示午宴与晚宴。

| 场次 | 场地 | 地址 | 高德定位 |
| --- | --- | --- | --- |
| 午宴 | 鑫华酒店 | 扬州市邗江区杨寿镇回归路2号 | [鑫华酒店](https://surl.amap.com/1j3Bc9pcbezn) |
| 晚宴 | 海德禧顺·精致淮扬菜·宴会厅 | 扬州市邗江区邗江北路83号 | [海德禧顺](https://surl.amap.com/1j9hnBx4jdeE) |

请柬以“午宴”“晚宴”区分场次。倒计时按上海时区计算剩余日期天数。日历文件 `huimen.ics` 包含两条 10 月 25 日的全天日程，场地分别保存。全天日程的结束日期使用 10 月 26 日，不包含该日；规则见 [RFC 5545 §3.6.1](https://www.rfc-editor.org/rfc/rfc5545#section-3.6.1)。实际日历导入须在目标手机上验证。

两套主题保留祝福功能。回门宴隐藏游戏按钮与火漆入口，不加载游戏入口配置。祝福沿用现有服务与消息房间。

分享元信息、日历直达链接和返回链接保留宴会类型、主题与家长署名。微信自定义分享沿用[微信分享配置](wechat-sharing.md)的接入条件。

## 维护与验证

回门宴日期、场次与场地维护于 `src/invitation-event.js`。页面、分享文案和日历消费这份配置。场地坐标来自用户提供的高德定位；高德与腾讯使用该定位，百度与 Apple 入口按地址查找。

`build/calendar-response.js` 在开发服务中提供回门宴日历，并在构建时生成 `dist/huimen.ics`。部署需要上传该文件。原 `public/wedding.ics` 保留婚礼日程及原 UID。

运行 `npm run build`，再运行：

```sh
node --test --test-concurrency=1 tests/invitation-event.test.mjs tests/huimen-journeys.test.mjs tests/calendar-response.test.mjs tests/share-metadata.test.mjs tests/parent-sharing.test.mjs tests/closing-invitation.test.mjs tests/invitation-polish.test.mjs
```

浏览器测试使用项目既有的 `PLAYWRIGHT_MODULE_PATH` 与 `PLAYWRIGHT_CHANNEL`。新增检查覆盖两场日历、无效参数、日期边界、两套主题、320 像素窄屏、长署名、导航地址、祝福入口、游戏隐藏和微信日历返回。截图保存在 `.temp/huimen-qa/`。
