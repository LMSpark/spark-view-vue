# 第 02 集长视频稿：四文件协议：把一个页面拆成可治理的生产资料

目标时长：6-10 分钟  
来源文章：`../../blog-series/02-four-file-protocol.md`  
核心句：`rule.json`、`pagedata.json`、`script.js`、`style.css` 是 SPARK_VIEW 页面可治理的最小资产单元。

## 口播稿

### 00:00 开场

如果页面配置只有一个巨大 JSON，短期很方便，长期会非常痛苦。结构、数据、脚本、样式混在一起后，预览、回滚、AI 修改和差异审查都会变得困难。

### 01:20 核心机制

四文件协议把页面拆成四种职责：`rule.json` 描述组件树，`pagedata.json` 描述数据空间，`script.js` 描述行为扩展，`style.css` 描述样式资产。拆开以后，每个文件都能单独加载、编译、检查和更新。

### 03:20 源码跟读

画面先看 `spark-page-config` 的 loader 和 compiler。Loader 回答文件从哪里来，Compiler 回答文件如何变成 PageConfig。再看后端 `PageConfigController` 和 DevSystem 的 `page-file-documents.ts`，说明同一套四文件既能来自服务端，也能来自编辑器内存态。

### 05:40 图解总结

用四象限图展示：结构进 Renderer，数据进 DataSet，脚本进沙箱，样式进页面样式注入。四者一起构成页面资产，缺任何一个都不是完整生产单元。

### 07:30 收束

四文件协议让页面有了可治理边界。下一集看 monorepo 如何把运行时、数据层、AI 和构建工具放到各自位置。

## 源码锚点

- `packages/spark-page-config/src/loader/index.ts`
- `packages/spark-page-config/src/compiler/index.ts`
- `spark-ai-server/src/main/java/com/spark/ai/controller/PageConfigController.java`
- `src/views/app/dev-system/page-file-documents.ts`
