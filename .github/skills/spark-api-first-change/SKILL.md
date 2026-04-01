---
name: spark-api-first-change
description: 'SPARK 仓库 API-first 变更工作流。Use when handling page-config, routes, navigation, tenant/project scoped APIs, generic CRUD, cache, logs, AI generation, or SSE debug flows. Prefer existing backend APIs, frontend integration, scoped endpoints, batch writes, and fail-fast diagnostics over backend-first changes or silent fallbacks.'
argument-hint: 请输入要处理的功能、缺陷或调试目标
user-invocable: true
---

# SPARK API-First 变更工作流

## 适用场景

- 页面配置读写、页面创建、路由同步
- 导航树、平台路由、项目切换、多租户上下文
- 通用数据 CRUD、表结构管理、配置读写
- AI 页面生成链路、组件元数据、SSE 调试链路
- 需要判断“前端接现有 API”还是“必须补后端接口”的场景

## 不适用场景

- 纯组件样式微调、与后端 API 无关的局部前端问题
- 没有 API 边界的纯算法或纯渲染层重构
- 需要全局、长期生效的团队约束
这类内容更适合写进 copilot-instructions.md，而不是技能。

## 目标

在 SPARK 仓库中，用一致的方法完成与 API 相关的需求或故障处理：

1. 先确认现有 API 是否已覆盖。
2. 能走前端集成就不默认改后端。
3. 优先使用租户/项目作用域接口，兼容平铺接口只用于明确的历史调用链。
4. 暴露真实失败原因，避免静默兜底掩盖根因。
5. 数据问题若已存在可执行数据库入口，优先走 dbsql 或直接 SQL 修复，不污染应用代码。
6. 只做满足需求的最小改动，并完成验证。

## 执行步骤

### 1. 明确目标与边界

先把请求归类到以下一种或多种能力域：

- pages-config
- navigation
- project
- generic data CRUD
- app config
- logs or cache
- AI chat or page generation
- SSE 调试

至少明确这 4 个问题：

1. 用户要达成的结果是什么。
2. 涉及哪个租户、项目、页面或表。
3. 当前失败点在前端调用链、接口契约还是后端实现。
4. 这是应用行为问题，还是脏数据/历史数据问题。
5. 是否已有兼容路径或历史接口需要保留。

### 2. 先梳理现有 API，不要直接改代码

先查仓库中已经存在的控制器、服务说明或项目内 API 清单，再决定改动点。

最低检查项：

- 是否已有对应 Controller 和 endpoint
- 是否已有 scoped 接口可直接使用
- 是否已有 batch 接口可以减少多次写入
- 是否已有 SSE 调试触发和回执链路
- Generic CRUD 是否已有参数兼容逻辑，如 pageSize 或 size、sort:dir 或 sort + order
- 前端 baseURL 与后端相对路径是否会拼出错误 URL，如 /api/api/...

如果现有 API 已覆盖需求：

- 默认只改前端调用链、参数、状态处理、错误展示或测试
- 不要为了“看起来更顺手”新增重复后端接口

### 3. 做接口选择决策

遵循以下分支规则。

#### 分支 A：已有接口能覆盖

- 选择前端接入或修正调用链
- 优先修复参数、上下文、序列化、错误处理、状态同步
- 后端只在存在明确契约缺口时才进入候选项

#### 分支 B：需要 pages-config 相关接口

- 优先使用 /api/tenants/{tenantId}/projects/{projectId}/pages-config/**
- 只有历史调用链、兼容迁移或现有 Loader 明确依赖时才使用 /api/pages-config/**
- 使用兼容接口时，必须确认请求头里带有 X-Tenant-Id 和 X-Project-Id
- 多文件写入优先 __batch，不要拆成多个单文件写请求

#### 分支 C：需要导航、项目、数据 CRUD

- 优先 scoped 多租户接口
- 不要绕开现有 tenant/project 上下文自己拼另一套协议
- 如果是数据修复或历史迁移，优先显式 API 或数据库入口，不要把迁移偷偷塞进应用启动流程
- 如果已经找到可执行数据库入口，且问题根因是脏数据、缺失数据、错误关联或历史残留，优先用 dbsql 或直接 SQL 修复
- 一旦确认了数据库修复入口，应记录并复用，不要为了修一笔坏数据去污染前后端业务代码

#### 分支 C1：判断是否该走数据库修复

当满足以下特征时，优先考虑数据库入口而不是改应用代码：

- 故障只影响少量历史数据或个别租户/项目
- 接口和前端逻辑都基本正常，只有数据内容错误
- 修复动作本质是补数据、改字段、清脏数据、改关联
- 为了兼容坏数据而改代码会引入长期维护成本

如果选择数据库修复：

1. 先确认可执行入口，如 dbsql 或可直接执行的 SQL 通道。
2. 先定位最小修复语句，不扩大影响面。
3. 修复后通过现有 API 或页面行为回归验证。
4. 把入口与修复模式记录下来，便于下次复用。

#### 分支 D：需要 SSE 调试

必须按完整链路处理，而不是只看触发成功：

1. 后端触发 request
2. 监听 /api/events
3. 等待前端执行并回传 result
4. 用 requestId 串联一次完整链路

只有看到 result 成功，才算调试完成。

#### 分支 E：现有接口确实不覆盖

只有在下面条件同时满足时，才考虑补后端：

- 已明确检索过现有 API，确认没有可用入口
- 缺口是契约级缺口，不是前端误用
- 已说明为什么不能通过现有 scoped 接口、batch 接口或前端适配解决

新增后端时，优先补最小接口面，不要顺手扩成一套新协议。

### 4. 实施改动时保持 fail-fast

实现时遵循以下原则：

- 不要吞错
- 不要加静默 fallback 掩盖真实问题
- 错误信息要能定位到缺失参数、错误上下文、错误 endpoint 或链路中断点
- 对兼容路径要显式判断，不要模糊兜底
- 若因上下文缺失导致无法走兼容接口，应直接报缺少 X-Tenant-Id 或 X-Project-Id，而不是退回默认租户

如果是历史数据或特殊兼容逻辑：

- 优先做显式迁移或显式调用
- 不要把副作用藏在启动阶段或普通读取流程里

### 5. 控制改动范围

优先顺序：

1. 前端调用链修正
2. 参数与上下文修正
3. 错误处理与日志补全
4. 数据库最小修复
5. 测试补齐
6. 后端最小补口

除非需求明确要求，否则不要同时重写前后端两边协议。

### 6. 验证与收尾

至少完成以下检查：

- 调用的 endpoint 与目标场景一致
- tenantId、projectId、pageId、tableName 等关键上下文完整
- 兼容接口在需要时已补齐头信息
- pages-config 多文件写入已优先使用 __batch
- Generic CRUD 请求参数与后端兼容规则一致，如 pageSize 或 size、sort 表达方式
- 前端不会因为 baseURL 与相对路径叠加而拼出错误地址
- SSE 链路已验证到 result，而不是停在 request
- 新增错误处理不会掩盖根因
- 若走了数据库修复，已完成修复后 API 或页面回归验证
- 相关测试、类型检查或最小可运行验证已执行

## 输出要求

完成任务时，输出结果应尽量包含：

- 实际采用的 endpoint 和选择原因
- 为什么判断为“只改前端”或“必须补后端”
- 如果最终走了数据库修复，说明为什么它比改代码更合适
- 是否存在兼容路径、批量写入或 SSE 特殊要求
- 已执行的验证
- 仍然存在的风险或待确认点

## 快速检查清单

- 我是否先梳理了现有 API，而不是直接写代码？
- 这个需求能否只通过前端接现有接口完成？
- 我是否优先用了 scoped 接口，而不是兼容平铺接口？
- 这是不是其实是数据问题，应该直接走数据库入口修复？
- 需要批量写入时，我是否用了 __batch？
- 我是否避免了静默 fallback？
- 若是 SSE 调试，我是否验证到了 result 回执？
- 我是否只做了最小必要改动？

## 示例触发语句

- 用 spark-api-first-change 处理 pages-config 保存失败
- 用 spark-api-first-change 梳理导航保存应该走哪些接口
- 用 spark-api-first-change 判断这个需求是否真的需要改后端
- 用 spark-api-first-change 排查 SSE 截图调试链路
- 用 spark-api-first-change 判断这次异常该修前端调用链还是直接修数据库数据