# Vue Virtual Card Scroll Demo

这是一个可直接拷贝的纯前端 demo，用 Vue 3 全局构建实现虚拟滚动分页卡片。

## 使用方式

直接双击打开：

```text
index.html
```

不需要安装依赖，不需要启动服务。`vendor/vue.global.prod.js` 已经随目录一起打包。

## Demo 行为

- 总页数默认 1000 页
- 每页固定 6 个卡片
- 滚动条代表完整数据量
- 拖动时只实时显示目标页，不请求中间页
- 停稳后通过 `mockFetchCards()` 异步加载目标页附近数据
- 卡片图片通过 `IntersectionObserver` 按可见性加载：进入可视区域请求图片，离开时取消未完成请求或降级为预览图
- `上页` / `下页` 支持微调
- 鼠标滚轮按速度跳页：慢滚 1 页，快速滚动会跳多页
- mock 请求支持 `AbortController`，快速跳页会取消无用请求
- 缓存最多保留最近 24 页

## 文件说明

- `index.html`: Vue 组件、样式、mock 异步数据都在这里
- `vendor/vue.global.prod.js`: Vue 3 浏览器运行时
- `vue-source/`: 可集成到项目中的 Vue 源码版

## Vue 源码版

源码入口：

```text
vue-source/src/App.vue
```

核心文件：

```text
vue-source/src/components/VirtualCardViewport.vue
vue-source/src/components/LazyCardImage.vue
vue-source/src/composables/useVirtualCardPaging.ts
vue-source/src/mock/mockFetchCardImage.ts
vue-source/src/mock/mockFetchCards.ts
vue-source/src/types.ts
vue-source/src/styles.css
```

如果同事想单独跑源码版：

```bash
cd vue-source
pnpm install
pnpm dev
```

如果要集成进已有 Vue 3 项目，优先拷：

```text
vue-source/src/components/
vue-source/src/composables/
vue-source/src/mock/
vue-source/src/types.ts
vue-source/src/styles.css
```

然后把 `App.vue` 里的组合方式接进自己的页面即可。
