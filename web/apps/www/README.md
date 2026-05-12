# LUMIMAX 官网

这是一个独立的官网单页，用于部署到根域名，例如：

- `https://example.com/` -> 官网
- `https://example.com/admin` -> 管理后台
- `https://example.com/api` -> 后端 API

## 需要替换的环境变量

在 [`.env`](/Volumes/dev/workspace/@ai/lumimax/web/apps/www/.env) 中替换以下链接：

- `VITE_APP_DOWNLOAD_URL`: 扫码下载入口
- `VITE_APP_DOWNLOAD_IOS`: iPhone 下载地址
- `VITE_APP_DOWNLOAD_ANDROID`: Android 下载地址

## 当前结构

- [index.html](/Volumes/dev/workspace/@ai/lumimax/web/apps/www/index.html)
- [src/App.vue](/Volumes/dev/workspace/@ai/lumimax/web/apps/www/src/App.vue)
- [src/styles.css](/Volumes/dev/workspace/@ai/lumimax/web/apps/www/src/styles.css)
- [public/lumimax-scale-hero.svg](/Volumes/dev/workspace/@ai/lumimax/web/apps/www/public/lumimax-scale-hero.svg)
