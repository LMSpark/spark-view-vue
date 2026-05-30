# SPARK View 文档

> 当前口径：SPARK View 以软件项目模型为核心，`spark-page-config` 保持纯模型；DevSystem、Vue 和 AI 都是消费层。

## 主线

```text
ProjectModel
  -> ProjectNodeCollection(flat nodes)
  -> ProjectPlanningModel
  -> ProjectConfigPageNodeModel(page/sub-page)
  -> SparkPageRenderer
```

`navigation` 是后端传输命名；模型层把它解释为项目节点。树只是 flat nodes 的投影。

## 核心文档

1. [architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md](architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)：ProjectModel、ProjectNodeCollection、PageNode 子类。
2. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：项目节点到运行时渲染的数据流。
3. [SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md](SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md)：项目整体认知。
4. [guides/CONFIG_SYSTEM.md](guides/CONFIG_SYSTEM.md)：应用配置与项目节点配置边界。
5. [ai/spark-ai-complete-guide.md](ai/spark-ai-complete-guide.md)：AI runtime 与业务注册。

## 文档规则

- 不再使用旧页面聚合术语作为公共模型术语。
- 不再把旧模块树字段写成模型字段。
- 说明 navigation 时必须标明它是后端历史命名，模型 SSOT 是 flat project nodes。
- 涉及页面内容时使用 PageNode / 配置页节点 / 四文件投影。
