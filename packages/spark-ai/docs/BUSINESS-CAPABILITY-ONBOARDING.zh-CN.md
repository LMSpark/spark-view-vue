# 新业务能力接入清单

> 抽象步骤，不绑定 pageDesign。完整上下文见 [`END-TO-END-PLATFORM.zh-CN.md`](END-TO-END-PLATFORM.zh-CN.md) §2、§15。

## 五层必答题

| 层 | 问题 | 典型产出 |
|----|------|----------|
| 领域 | 根 class + 公开 API？ | `spark-*/src` + JSDoc |
| 知识 | manifest + rootClassName？ | `generate:class-model-surface` |
| 能力包 | Registration 怎么组装？ | `ensureXxxBusiness()` |
| 运行 | 谁 `Host.run`？ | Runner / UI / Host Run |
| 交付 | 何时 commit / 回执？ | save 策略、Host Run result |

## 阶段清单

### A · 领域（spark-*）

- [ ] 根 class + `@module`（职责/边界/AI用途）
- [ ] 公开 mutator；子 model 经 public 属性可达
- [ ] 确定 `identityField` 语义（→ `businessInstanceId`）

### B · 知识（编译）

- [ ] `pnpm run generate:class-model-surface`
- [ ] `classIndex[RootClass]` 存在
- [ ] `semantic-gaps.json` 可接受
- [ ] mutator 回调 ref 闭包可达

### C · 能力包（APP）

- [ ] `host.ensure(alias, { create })` 幂等
- [ ] `ClassModelAgentAdapter.createRegistration({ rootClassName, manifestUrl, knowledge, inputContract, sessionStore })`
- [ ] `createSimpleInputContract({ businessId, identityField, messageField, paramsSchema })`
- [ ] `beforeFunctionCall` gates（仅拦 mutation）
- [ ] `host.dryRun(alias, sampleInput)` 通过

### D · 运行

- [ ] `host.run(alias, input, chat?)` 入口
- [ ] 工单 DTO 与 `paramsSchema` 一致
- [ ] `turnCallbacks` 已在 Host 构造时注入

### E · 交付（APP，非 spark-ai）

- [ ] Commit 时机：手动 save / Host Run auto-save
- [ ] 可选 Receipt：`ai-host-run-bridge`
- [ ] 明确：Script ≠ Delivery

### F · 验收

- [ ] dryRun + guide/script 手工链路
- [ ] loader 闭包测试
- [ ] DevSystem 或 staging Host Run

## 代码模板

见 [`END-TO-END-PLATFORM.zh-CN.md` §15.3](END-TO-END-PLATFORM.zh-CN.md#153-阶段-c--业务能力包app-ensure)。

## 参考实现

| 能力 | 文件 |
|------|------|
| pageDesign | `src/services/page-design/page-design-business.ts` |
| pageDataDesign preset | `src/services/page-data-design/page-data-design-host-run-provider.ts` |
| projectPlanning | `src/services/project-planning/project-planning-business.ts` |
| DeliveryPort | `src/services/ai/ai-delivery-port.ts` |

## 常见误接

| 误区 | 正确 |
|------|------|
| 每个 pageId 一个工厂 | 一个 **能力** 一个 ensure |
| Script 完 = 交付 | 内存变更 ≠ 落盘 |
| orders 是新 alias | orders 是 **instanceId** |
