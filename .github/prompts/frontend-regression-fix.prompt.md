---
description: "修复 SPARK 前端在渲染器、字段、容器、数据绑定或组件注册代码中的回归。用于诊断 UI 行为异常、DataViewKey 接线、表格列缺失或能力链回归。"
name: "前端回归修复"
argument-hint: "描述回归现象、相关文件、失败测试或页面路径"
agent: "agent"
---

使用 [frontend-spark.instructions.md](../instructions/frontend-spark.instructions.md) 和 [tests-and-validation.instructions.md](../instructions/tests-and-validation.instructions.md)。

修复下面描述的 SPARK 前端回归。

输入可能包含：

- 出问题的页面或路由
- 组件类型或符号
- 失败测试或错误信息
- 疑似文件或代码路径

工作流：

1. 从最具体的本地锚点开始：失败文件、符号、行为或测试。
2. 扩大范围前先检查最近的前端控制路径。常见热点包括：
   - `SparkComponentRenderer.vue`
   - container children forwarding
   - `bindRules.ts`
   - `useSparkComponent.ts`
   - `data-view-key.ts`
   - component registration paths
3. 明确检查回归是否由以下 SPARK 特有问题导致：
   - 破坏 `el-table` -> `el-table-column` 直接结构
   - 表格直连组件路径中出现异步注册
   - `DATA_SOURCE` / `PAGE_DATASET` 能力接线丢失
   - 基于 `@` 的 `dataViewKey` 或 `dataMember` 无效
   - 重新引入 raw page-data 或旁路数据流
4. 在所属抽象层做最小可行修复。
5. 先运行最便宜的聚焦验证：邻近测试、定向类型检查信号或其他窄范围可执行检查。
6. 报告根因、修复内容和验证结果。

输出要求：

- 根因
- 变更文件
- 已运行验证
- 剩余风险或覆盖缺口

请求：

{{input}}
