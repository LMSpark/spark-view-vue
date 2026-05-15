# 包目录索引

`packages/` 是 SPARK 的 monorepo 工作区。这里按“运行时包、AI 相关包、构建期包、插件包”分层组织，而不是把所有能力都堆在根应用里。

## 运行时主包

- [spark-app/README.md](spark-app/README.md)：应用层启动、路由、插件、日志与页面宿主。
- [spark-component/README.md](spark-component/README.md)：组件系统、能力链、渲染容器。
- [spark-data/README.md](spark-data/README.md)：DataSet、DataView、关系、树、聚合。
- [spark-page-config/README.md](spark-page-config/README.md)：页面配置加载、脚本上下文与配置装配。
- [spark-utils/README.md](spark-utils/README.md)：公共底层工具和能力键。

## AI 与目录生成

- [../docs/ai/SPARK_AI_PACKAGE_USAGE_GUIDE.md](../docs/ai/SPARK_AI_PACKAGE_USAGE_GUIDE.md)：AI 运行时、Function Calling 会话、组件知识目录与页面编辑工具。
- [vite-plugin-spark-catalog/README.md](vite-plugin-spark-catalog/README.md)：构建期组件目录与提示词元数据生成。

## 插件与集成

- [vxe-table/README.md](vxe-table/README.md)：VXE Table 集成工作区。

## 维护约束

- 新增工作区包时，必须同步更新这里和根 [../README.md](../README.md)。
- 运行时逻辑优先放进现有包，避免在根 `src/` 再长出平行基础设施。
- 构建期工具与运行时包分开维护，不把构建脚本塞进运行时源码目录。
