# 文档索引

SPARK 的文档按“如何使用”“为什么这样设计”两层组织；AI 相关约束统一收敛到单篇 SSOT 指南，先按问题类型找入口，不要一开始就通读全部目录。

## 目录分层

- [guides/README.md](guides/README.md)：面向使用者和接入方，优先看这里。
- [architecture/README.md](architecture/README.md)：面向维护者，记录系统内部结构和关键设计决策。
- [ai/spark-ai-complete-guide.md](ai/spark-ai-complete-guide.md)：AI Core、显式业务会话、业务输入注册、LLM 工具协议与 pageDesign 链路的唯一入口。

## 建议阅读顺序

1. [guides/QUICKSTART.md](guides/QUICKSTART.md)：先把项目跑起来。
2. [guides/DATA_MANAGEMENT.md](guides/DATA_MANAGEMENT.md)：理解 DataSet / DataView。
3. [guides/CONDITION_EXPRESSION.md](guides/CONDITION_EXPRESSION.md)：理解过滤表达式与计算表达式的执行边界。
4. [guides/CONFIG_SYSTEM.md](guides/CONFIG_SYSTEM.md)：理解页面结构配置与脚本边界。
5. [architecture/DATAFLOW_ARCHITECTURE.md](architecture/DATAFLOW_ARCHITECTURE.md)：需要深入运行时时再看内部链路。
6. [ai/spark-ai-complete-guide.md](ai/spark-ai-complete-guide.md)：涉及 AI Core、业务按钮入口或页面级 AI 编辑链路时再进入。

## 使用约定

- `guides/` 只放当前仍然有效的使用文档。
- `architecture/` 只放系统结构与演进说明，不放操作手册。
- AI 相关规则不再拆散到多篇归档文档，统一维护在 [ai/spark-ai-complete-guide.md](ai/spark-ai-complete-guide.md)。
