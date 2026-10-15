# 长图工坊

一个面向 iPhone Safari 的轻量长截图拼接 PWA。选入连续截图后，可以调整顺序、自动识别或微调重叠区域、预览并导出 PNG。所有图像处理都在浏览器本机完成。

## 在 iPhone 上使用

此项目是网页应用，需要通过 HTTPS 地址打开后才能添加到主屏幕。将本目录作为 GitHub 仓库根目录上传后，可以用 GitHub Pages 发布：

1. 在 GitHub 新建一个空仓库，把本目录中的文件上传到仓库根目录。
2. 打开仓库的 **Settings → Pages**，将构建来源设为 **GitHub Actions**。
3. 打开仓库的 **Actions → Deploy to GitHub Pages → Run workflow**，手动启动发布。
4. 等待工作流完成，打开生成的 HTTPS 页面地址。
5. 在 iPhone 上用 Safari 打开页面，点分享按钮，选择“添加到主屏幕”。

GitHub Free 仅支持从公开仓库发布 Pages；发布的网站可被互联网访问。请不要把密码、密钥等敏感信息放进仓库。

Apple 的说明：[将 Safari 中的网站添加到 iPhone 主屏幕](https://support.apple.com/zh-cn/guide/iphone/iph42ab2f3a7/ios)。

## 本地运行

用任意静态 HTTP 服务器托管本目录即可。Service Worker 离线缓存需要 HTTPS 或 localhost；图片拼接功能也可在直接打开 `index.html` 时使用。

## 能力范围

- 支持从相册选择多张图片，按顺序拼接并保存 PNG。
- 支持重排、删除、自动检测重叠和手动调整重叠量。
- 拼接计算在当前设备本地运行；不会上传截图。
- iOS 不允许网页直接读取其他 App 的屏幕。请先保存截图，再导入本工具。
- 为避免移动浏览器内存耗尽，超长输出会自动缩小尺寸。

