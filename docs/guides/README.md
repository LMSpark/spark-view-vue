# 使用指南索引

这个目录只放当前可执行、可落地的使用文档。第一次接触项目，按下面顺序阅读即可。

## 推荐顺序

1. [QUICKSTART.md](QUICKSTART.md)：安装、启动、最短上手路径。
2. [PACKAGE_USAGE.md](PACKAGE_USAGE.md)：理解 monorepo 各包各自负责什么。
3. [CONFIG_SYSTEM.md](CONFIG_SYSTEM.md)：页面结构配置、脚本与运行时边界。
4. [DATA_MANAGEMENT.md](DATA_MANAGEMENT.md)：DataSet、DataView、绑定与联动。
5. [TREE_CAPABILITY.md](TREE_CAPABILITY.md)：树形场景与级联能力。

## 常用专题

- [COMPONENT_DEVELOPMENT.md](COMPONENT_DEVELOPMENT.md)：新增或维护组件。
- [PLUGIN_CONFIGURATION.md](PLUGIN_CONFIGURATION.md)：插件接入与启停。
- [VUE_TEMPLATE_DSL.md](VUE_TEMPLATE_DSL.md)：模板 DSL 与结构化节点。
- [TESTING_BEST_PRACTICES.md](TESTING_BEST_PRACTICES.md)：前端测试编写方式。
- [PERFORMANCE_GUIDE.md](PERFORMANCE_GUIDE.md)：性能分析与优化策略。
- [CACHE_EXPIRATION_TIERS.md](CACHE_EXPIRATION_TIERS.md)：缓存分层与失效模型。

## 维护约束

- 新增使用文档优先放这里，而不是散落到根目录。
- 文档标题要能说明场景，避免出现无法从文件名判断用途的通用命名。
- 历史方案不要放进本目录；如果只作留档，应进入归档或架构文档并明确标记。