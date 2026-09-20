# 中式迎宾照源文件

`portrait-source.png` 是用户选定的生成成图，原生尺寸 887 × 1774。正式页面使用 `public/assets/chinese/portrait.webp`，分享图片使用 `public/share/chinese-wedding-portrait.jpg`。

`image-prompts.json` 的 `chinese-portrait` 项记录图像工具、输入角色和提示词入口。生成使用 `design/迎宾照.jpg`、`portrait-original-detail.png` 和无五官的 `portrait-proportion-guide.png`；比例图的矢量源文件为 `portrait-proportion-guide.svg`。参考图只参与生成，不在导出时拼贴到照片上。

运行以下命令从选定成图导出页面与分享资源，不会重新生图：

```shell
node design/prepare-chinese-portrait.mjs
```

脚本需要 Sharp；外部工具安装可通过 `SHARP_MODULE_PATH` 指定。将打印的 `shareVersion` 写入 `src/config.js` 的 `share.chineseImage` 版本参数。`portrait-layout.json` 保存源图尺寸和分享裁切，`portrait-provenance.json` 保存输出来源与内容哈希。

导出保留选定图的全部像素。修改源图、裁切或资源地址后运行图像与主题测试：

```shell
npm run build
node --test tests/chinese-portrait.test.mjs tests/chinese-theme.test.mjs tests/resource-layout.test.mjs tests/static-assets.test.mjs
```

浏览器测试可通过 `PLAYWRIGHT_MODULE_PATH` 和 `PLAYWRIGHT_CHANNEL` 指定工具环境。旧试制图与合成资料保存在本机 `.temp/archive/`，不属于提交或发布资源。
