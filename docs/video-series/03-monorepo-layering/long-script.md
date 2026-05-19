# 第 03 集长视频稿：Monorepo 的骨架：运行时、数据层与 AI 如何各就各位

目标时长：6-10 分钟  
来源文章：`../../blog-series/03-monorepo-layering.md`  
核心句：SPARK_VIEW 的 monorepo 是把应用启动、组件解释、数据内核、AI 能力和构建知识库拆成可独立演进的层。

## 口播稿

### 00:00 开场

一个配置化平台最容易失控的地方，是所有能力都堆进一个应用目录。组件、数据、路由、AI、构建插件和服务端配置互相 import，最后谁也不敢动。

### 01:20 核心机制

SPARK_VIEW 的 monorepo 不是为了看起来整齐，而是为了划边界。根应用负责集成，`spark-component` 负责组件解释和运行时，`spark-data` 负责数据模型，`spark-page-config` 负责配置加载和编译，`spark-ai` 负责 AI Core 协议和业务模块接入。

### 03:30 源码跟读

画面切到 `packages/README.md` 和根 `package.json`，先看 workspace 分层。再看 `spark-app/src/start.ts` 和 `spark-component/src/system/spark.ts`，说明启动和组件系统如何被抽成包。最后看 `vite-plugin-spark-catalog`，它把组件知识从源码构建为 AI 和设计器可消费的 catalog。

### 06:00 图解总结

这一集要让观众记住：monorepo 的价值不是目录多，而是依赖方向清楚。运行时不应该吞掉数据层，core AI 不应该吞掉业务语义，根应用不应该沉淀通用内核。

### 08:00 收束

有了分层，下一步看应用如何启动。第 4 集从 `main.ts` 一路走到 `SparkApp.start`。

## 源码锚点

- `packages/README.md`
- `package.json`
- `packages/spark-app/src/start.ts`
- `packages/spark-component/src/system/spark.ts`
- `packages/vite-plugin-spark-catalog/src/plugin.ts`
