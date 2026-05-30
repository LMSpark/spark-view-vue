# SPARK View 文档入口

> 文档只保留当前能指导设计、开发、调试和评审的内容。历史计划、旧迁移记录、重复解释和过期博客不再保留。

## 一句话主线

SPARK View 是软件项目模型：一个项目由平铺项目节点组成，节点按类型分为模块、配置页、Vue 页面、动作、外链和引用；树只是节点集合的投影。

```text
ProjectModel
  -> ProjectNodeCollection(flat nodes)
  -> ProjectPlanningModel
  -> ProjectNodeModel subclasses
  -> SparkPageRenderer / DevSystem / AI
```

`navigation` 只是后端历史命名；模型层的单一真源是 flat project nodes。`navigation` 字段已经进入 `ProjectNodeModel` 基类，配置页节点只扩展 `rule / dataSet / style / script` 内容子模型。

## 推荐阅读顺序

1. [guides/QUICKSTART.md](guides/QUICKSTART.md)：最短上手路径。
2. [SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md](SPARK_VIEW_PROJECT_DEEP_DIVE_ZH.md)：项目整体认知。
3. [architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md](architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)：项目模型、节点模型和配置页内容模型。
4. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：从项目节点到渲染运行时的数据流。
5. [ai/spark-ai-complete-guide.md](ai/spark-ai-complete-guide.md)：AI 运行时与业务模块注册。

## 目录边界

- [architecture/](architecture/README.md)：当前架构事实和跨包边界。
- [guides/](guides/README.md)：仍然可执行的操作指南。
- [ai/](ai/README.md)：AI 运行时、代码生成规则和业务闭环。
- 包内 README / API / ARCHITECTURE：只说明该包自己的公共面和边界。

## 写作规则

- 默认中文；英文只用于 API 名、文件名、命令、协议字段和第三方专有名词。
- 新文档必须先判断能否合并到现有文档。
- 计划类文档完成后删除；沉淀下来的规则合并进主文档。
- 不再新增 blog-series、历史迁移散篇、日期版文件名或 `DM-*.md`。
