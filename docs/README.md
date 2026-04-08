# 文档索引

SPARK 的文档按“如何使用”“为什么这样设计”“AI 相关约束”三层组织，先按问题类型找入口，不要一开始就通读全部目录。

## 目录分层

- [guides/README.md](guides/README.md)：面向使用者和接入方，优先看这里。
- [architecture/README.md](architecture/README.md)：面向维护者，记录系统内部结构和关键设计决策。
- [ai/README.md](ai/README.md)：AI 提示词、治理规则、AI 架构与归档说明。

## 建议阅读顺序

1. [guides/QUICKSTART.md](guides/QUICKSTART.md)：先把项目跑起来。
2. [guides/DATA_MANAGEMENT.md](guides/DATA_MANAGEMENT.md)：理解 DataSet / DataView。
3. [guides/CONFIG_SYSTEM.md](guides/CONFIG_SYSTEM.md)：理解页面结构配置与脚本边界。
4. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：需要深入运行时时再看内部链路。
5. [ai/README.md](ai/README.md)：涉及 AI 页面生成、提示词治理或 Stills 架构时再进入。

## 使用约定

- `guides/` 只放当前仍然有效的使用文档。
- `architecture/` 只放系统结构与演进说明，不放操作手册。
- `ai/` 下的归档文档由 [ai/README.md](ai/README.md) 统一标记，不把旧方案混进当前实现说明。