# Gather Tabs

一个本地保存的浏览器标签页收藏扩展。打开新标签页后，右侧列出当前窗口的网页标签页，鼠标靠近时会放大相邻标签；把标签页拖到中间任意收藏夹即可保存。也可以把网页链接拖进收藏夹、手动添加网址、搜索收藏、移动卡片和整理收藏夹。

## Chrome

1. 打开 `chrome://extensions`，启用“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本目录。
3. 打开新标签页。工具栏中的扩展按钮也会打开工作台。

## Safari (macOS)

需要完整的 Xcode。使用 Apple 的 Safari Web Extension 打包工具，将本目录转换为 Xcode 项目：

```sh
xcrun safari-web-extension-packager --macos-only "$(pwd)"
```

旧版 Xcode 使用工具名 `safari-web-extension-converter`。在 Xcode 中运行生成的 macOS App，然后在 Safari 设置的“扩展”中启用 Gather Tabs。安装后，如果 Safari 没有接管新标签页，可点击工具栏扩展按钮打开相同工作台。

当前开发机器只有 Xcode Command Line Tools，缺少 Safari 打包工具，因此尚未在 Safari 中完成安装验证。

## 本地预览

访问 `http://localhost:8765/preview.html` 可查看界面和测试拖拽。预览使用五个模拟标签页，数据保存在预览页面的 `localStorage` 中；正式扩展使用浏览器真实标签页和 `storage.local`。

## 数据与权限

收藏夹和网页存储在当前浏览器的 `storage.local`，没有账户、网络同步或服务器。扩展使用 `tabs` 权限读取当前窗口的标签页标题和网址，用于右侧列表；保存网页不会关闭原标签页。Chrome 与 Safari 的本地数据彼此独立。
