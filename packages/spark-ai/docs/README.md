# spark-ai 文档

| 文档 | 说明 |
|------|------|
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | 包架构 SSOT（治理、边界、主数据流） |
| [`NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md) | native-runtime、Adapter、ToolLoop、传输、pageDesign、F8 迁移展开 |
| [`TRANSPORT-AND-SESSION.zh-CN.md`](TRANSPORT-AND-SESSION.zh-CN.md) | V4 传输、session-turn / app-sse、ai-turn-bridge 序列与排错 |
| [`VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md`](VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md) | Generator 决策树、callbackApis 迁移设计（待实现） |
| [`PAGEDESIGN-DEVSYSTEM.zh-CN.md`](PAGEDESIGN-DEVSYSTEM.zh-CN.md) | APP 层 pageDesign × DevSystem 接线与排错 |
| [`../src/modules/DM-VCM-MODULE-METADATA-SCOPE.md`](../src/modules/DM-VCM-MODULE-METADATA-SCOPE.md) | VCM metadata 协议真源线 |
| [`../src/modules/MODULE-KIND-REGISTRATION.md`](../src/modules/MODULE-KIND-REGISTRATION.md) | AiModule 注册约束 |
| [`../src/modules/README.md`](../src/modules/README.md) | modules 协议层概览 |
| [`../../.cursor/plans/全面解决方案.md`](../../.cursor/plans/全面解决方案.md) | path 协议断代与 vcm_* 工具收敛计划 |

阅读顺序建议：`ARCHITECTURE.md` → `DM-VCM-MODULE-METADATA-SCOPE.md` → `NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md` →（按需）`TRANSPORT-AND-SESSION`、`VCM-GENERATOR-AND-CALLBACKAPIS`。
