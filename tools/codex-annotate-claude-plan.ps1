$ErrorActionPreference = 'Stop'

$path = 'C:\Users\lgf22\.claude\plans\ai-d-spark-view-packages-spark-componen-quizzical-lamport.md'
$full = (Resolve-Path -LiteralPath $path).Path
$text = [System.IO.File]::ReadAllText($full)

if ($text.Contains('CODEx-COMMENT-PASS-2026-05-28')) {
  Write-Output 'Codex annotations already present; no changes made.'
  return
}

$backup = "$full.codex-review-20260528.bak"
[System.IO.File]::WriteAllText($backup, $text, [System.Text.UTF8Encoding]::new($false))

function Add-After([string]$source, [string]$needle, [string]$insert) {
  if (-not $source.Contains($needle)) {
    throw "Needle not found: $needle"
  }
  return $source.Replace($needle, "$needle`r`n`r`n$insert")
}

$titleComment = @'
<!-- CODEx-COMMENT-PASS-2026-05-28 -->

> **Codex 总批注**：这个方向值得做，但当前方案把“AI 运行时会话监控 UI”直接落在 `packages/spark-component`，会引入新的 `@spark-view/spark-ai` 依赖和业务会话语义，和现有 `spark-component` 的页面渲染器/通用组件边界不完全一致。建议 Claude 先把方案拆成两层：
> 1. **AI 会话 UI/状态层**：如果要通用化，优先新建 `@spark-view/spark-ai-ui`（或先落在 `src/views/app/dev-system/components` 做 app-owned 实验）；不要默认塞进 `spark-component`。
> 2. **运行时协议层**：由 `spark-ai` 暴露或补齐必要 API（session key、stop、pre-tool approval、session listing），UI 只消费稳定协议。
>
> 当前原案更像“愿景稿”，不是可直接开工的实现稿。下面的批注按阻塞程度标注：**阻塞**需要改方案，**建议**可作为分期优化。
'@

$goalComment = @'
> **Codex 批注（目标收窄）**：目标描述里的“可嵌入任何需要 AI 对话能力的页面”太宽。现有仓库已经有 app 层 `src/services/page-design-ai-runner.ts`，它通过 `AI_AGENT_HOST` capability、`ensurePageDesignBusiness()` 和 `PageEditor.createPageDesignEditHost()` 把 pageDesign 跑起来；但还没有“通用 Host 会话枚举/恢复/停止”能力。建议先把目标改成：**展示由调用方显式创建的 AiAgentSessionHandle 列表**，而不是“自动监视 Host 下多个业务会话”。否则组件会误以为 `host.listRegistrations()` 等于会话列表，实际它只是业务注册入口列表。
'@

$constraintsComment = @'
> **Codex 批注（包边界阻塞）**：`spark-component` 当前 `package.json` 没有依赖 `@spark-view/spark-ai`，公共包依赖主链是 `spark-utils -> spark-data -> spark-page-config -> spark-component -> spark-app`。虽然 `spark-ai` 本身很轻，但把 AI runtime 类型直接导入通用组件包，会让组件系统承担 agent 会话语义。建议二选一：
> - 若只是 DevSystem/pageDesign UI：落在 `src/views/app/dev-system` 或 `src/components`，复用已有 app service。
> - 若要发布成通用包：新建 `packages/spark-ai-ui`，peer 依赖 `vue` / `element-plus`，dependencies 依赖 `@spark-view/spark-ai`。
>
> 只有在明确决定“spark-component 就是 AI UI 的发布面”时，才补 `@spark-view/spark-ai` 到 `packages/spark-component/package.json`，并更新架构校验说明。
'@

$fileStructureComment = @'
> **Codex 批注（分期建议）**：22 个文件一次性铺开风险偏高，而且其中不少组件依赖尚未存在的运行时能力。建议 Claude 改成三期：
> - M1：`useSessionStream` + `useSessionDiagnostics` + 一个只读 `AiSessionTracePanel`，消费调用方传入的 callbacks/record，不负责启动 Host。
> - M2：增加 `AiSessionRunner` 适配层，支持 start/send/abort 的 UI 壳。
> - M3：在 `spark-ai` 增加 pre-tool approval/stop/listSessions 后，再做审批和多会话管理。
>
> 如果仍保留这个目录结构，至少先加一个 adapter 类型文件，比如 `AiSessionMonitor.adapter.ts`，避免 Vue 组件直接知道 `AiAgentHost.run()` 的所有细节。
'@

$propsComment = @'
> **Codex 批注（Props 阻塞）**：`host: AiAgentHost` 不足以让组件启动通用会话。`host.listRegistrations()` 只能拿到 alias/moduleId/name/description，拿不到每个业务的必填 input 表单，也拿不到已有 session 列表。建议改为调用方传入显式 entries/runner：
>
> ```ts
> export type AiSessionMonitorEntry = Readonly<{
>   key: string
>   label: string
>   alias: string
>   input: AiJsonParams
> }>
>
> export type AiSessionRunner = Readonly<{
>   run(command: AiSessionRunCommand): Promise<AiSessionRunResult>
>   send(command: AiSessionSendCommand): Promise<void>
>   abort(sessionKey: string): void
> }>
> ```
>
> 这样 pageDesign 可以由 app 层把 `{ pageId, userRequirement, mode }` 组好再交给 UI；通用组件不猜业务 input，也符合 fail-fast。
'@

$emitsComment = @'
> **Codex 批注（事件语义）**：`session-start` / `session-stop` 里的 `alias + moduleId` 不是会话身份，缺少 `moduleInstanceId` 或 `sessionId`。同一个 alias 可以跑多个 pageId/draftId。建议所有事件统一带 `sessionKey/sessionId + alias + moduleId + moduleInstanceId`。另外当前 `spark-ai` 没有 `session.stop()` 或 `host.stop()`；`session-stop` 只能表示 UI 本地关闭/abort，不能承诺 sessionStore 已 Stopped。
'@

$streamTypeComment = @'
> **Codex 批注（类型对齐）**：`AiAgentToolCallRecord.status` 目前只有 `'success' | 'error'`，没有 pending。pending 可以从 `onStreamEvent` 的 `type='result'` 中读到 `toolCalls` 后先建卡片，再用 `onToolCall` 的完成记录覆盖；但这不是原案写的 `onToolCall -> pending`。`resultSummary` 也要按当前结构映射：成功用 `record.result.summary ?? previewAiAgentDiagnosticValue(record.result.data)`，失败用 `record.result.msg/fix/checks`。
'@

$componentTreeComment = @'
> **Codex 批注（交互范围）**：组件树合理，但“新建 Tab”不应直接从 alias 新建会话。需要调用方提供“新建会话命令”（例如 pageDesign 的 pageId/userRequirement/mode）。否则 UI 只能列出业务类型，无法构造合法 `AiJsonParams`，会在 `createAiAgentTask()` schema 校验处 fail-fast。
'@

$dataFlowComment = @'
> **Codex 批注（数据流阻塞）**：这里把 `Map<alias, SessionState>` 当成多会话状态中枢是错误的。`alias` 是业务入口，不是会话实例；`AiAgentSession.sessionId` 由 kind + businessInstanceId 得来。应改成 `Map<sessionKey, SessionState>`，其中 sessionKey 至少包含 `{ alias, moduleId, moduleInstanceId }`。
>
> 另外 `host.run()` 会在内部 `await session.send(...)`，也就是说 Promise resolve 时首轮已经结束；流式期间只能靠传入的 callbacks 更新 UI，不能先拿到 session 再监听。若 UI 需要启动后立即得到 session handle，`spark-ai` 需要新增低层 API，或调用方自己用 `createAiAgentTask/createAiAgentSession/session.start/session.send` 编排。
'@

$streamBufferComment = @'
> **Codex 批注（完成信号）**：当前 API 没有独立的“turn 完成”回调；完成边界来自 `host.run()` / `session.send()` 的 Promise `finally`，以及 `onStreamEvent` 的 `done/result/error`。所以 `assistant-delta -> assistant-complete` 不应只写在 `useSessionStream` 内部假定，应由 runner 在 send 完成后调用 `stream.completeTurn()`。
>
> 推理块默认折叠可以做，但 `onReasoning` 是增量；要避免每个 reasoning delta 都新增一块，应按 turnId 聚合。turnId 可从 `onStreamEvent.scope.turnId` 或自建 turn meta 传入。
'@

$multimodalComment = @'
> **Codex 批注（多模态建议降级）**：当前 `AiAgentChatMessage.content` 确实只有 string，但把 base64 数据 URL 直接拼进 prompt 风险很高：token 爆炸、历史膨胀、隐私/日志污染，而且后端 turn bridge 未声明图片 content array 能力。建议 M1 只支持“附件引用文本”：由调用方 `resolveAttachments(files)` 上传/落库后返回 URL、摘要或 page file ref，再拼短文本。图片 base64 只允许小尺寸预览，不进入 `historyMsgs`。
'@

$monitorComment = @'
> **Codex 批注（UseSessionMonitor 重写）**：`connectSession(alias, input)` 可以保留为底层动作，但公共状态不要以 alias 为 key。建议签名改成 options 对象，符合本仓“4 个以上参数使用 options”的规范，也方便加入 `moduleInstanceId/sessionLabel/abortController`：
>
> ```ts
> connectSession(command: ConnectAiSessionCommand): Promise<void>
> sendMessage(command: SendAiSessionMessageCommand): Promise<void>
> abortSession(sessionKey: string): void
> closeSession(sessionKey: string): void
> ```
>
> `closeTab` 目前不能承诺停止 runtime；只能清 UI 状态。若需要真正停止，先在 `spark-ai` 增加 `AiAgentSession.stop(reason)` 并让 store 标记 Stopped。
'@

$streamComposableComment = @'
> **Codex 批注（Callbacks 形状）**：`createCallbacks()` 返回 `Pick<AiAgentChatRequest, ...>` 是对的，但还缺 `signal` 的组合点。建议 runner 负责把 `AbortController.signal` 和 callbacks 合并，`useSessionStream` 只处理事件，不持有 controller。这样测试也更纯。
'@

$historyComment = @'
> **Codex 批注（历史刷新）**：不要定时轮询。`DefaultAiAgentSessionStore.getSessionRecord()` 返回深拷贝，频繁轮询会浪费；同时“只在 toolCall 最后一条刷新”会漏掉纯文本回答、错误、abort 和 maxToolRounds。建议在每次 `run/send` 的 `finally` 中 refresh，一并在 `onToolCall` 后做轻量 refresh。
'@

$diagnosticsComment = @'
> **Codex 批注（诊断来源）**：诊断函数可复用，但 issue 提取要对齐当前历史类型：历史里失败工具调用是 `kind='functionCall'` 且 `status='failed'`，失败详情在 `entry.error`，不是 `status='error'`。实时记录里才是 `AiAgentToolCallRecord.status === 'error'`。
'@

$lifecycleComment = @'
> **Codex 批注（Abort 语义）**：`AbortController.abort()` 目前只让 tool loop 提前 return；`AiAgentToolLoopRunner` 没有调用 `sessionStore.stopSession()`，所以 session record 仍可能是 `Started`。UI 可以显示本地 aborted，但如果诊断面板读 sessionStore，会看到未停止。这里要么修改文案，要么在 `spark-ai` 增加显式 stop API。
'@

$approvalComment = @'
> **Codex 批注（审批流阻塞）**：这一节与当前 `spark-ai` 执行顺序不匹配。`afterFunctionCall` 是在 `runtime.executeTool()` 之后调用的；`onToolCall` 也是工具已执行并写入 sessionStore 之后才触发。因此它不能用于“审批当前工具调用”。如果需要真正的人工审批，必须先在 `spark-ai` 增加 **before/preFunctionCall** 生命周期钩子，执行顺序应是：解析 tool call -> emit approval pending -> await approve/reject -> runtime.executeTool -> appendFunctionCall -> afterFunctionCall。没有这个内核能力前，组件只能做“结果确认/继续下一轮审批”，不能做执行前审批。
'@

$exportComment = @'
> **Codex 批注（导出策略）**：如果最终不放 `spark-component`，这里整节应改成对应包/应用目录的导出策略。如果放 `spark-component`，除了 `components/index.ts` 和 `src/index.ts`，还要同步 `packages/spark-component/package.json` dependencies/peerDependencies，并跑包级 typecheck。`register-renderers.ts` 不注册这个判断是对的，它不是 SparkNode renderer。
'@

$validationComment = @'
> **Codex 批注（验证命令修正）**：命令建议改为仓库实际可用形式：
>
> ```bash
> pnpm --filter @spark-view/spark-component run typecheck
> pnpm --filter @spark-view/spark-component run lint
> pnpm --filter @spark-view/spark-component exec vitest run src/tests/ai-session-monitor
> pnpm run verify:rules
> ```
>
> 如果落在 app 层，则跑根级 `pnpm run typecheck`、`pnpm run lint`、定向 Vitest。不要把 `pnpm run build` 作为默认验证，AGENTS 明确说完整 build 包含 Java/较慢流程，除非需要构建验证。
'@

$riskComment = @'
> **Codex 批注（风险表需要补三项阻塞）**：建议在表里新增：
> - **会话身份错误**：alias 不是 session key；必须引入 moduleInstanceId/sessionId。
> - **审批时机错误**：当前 afterFunctionCall 发生在工具执行后；执行前审批需要 spark-ai 新 API。
> - **停止语义缺失**：Abort 不会 stop sessionStore；close/stop UI 文案必须区分本地中断和 runtime 停止。
>
> 原表里“仅在 turn 完成时刷新（通过 onToolCall 最后一条触发）”也要改；没有 tool call 的 turn 同样要刷新。
'@

$finalComment = @'

---

## Codex-Claude 协调建议稿

> **建议 Claude 先按这个顺序改原方案**：
>
> 1. **改落点**：把“在 `packages/spark-component` 创建”改成“先 app-owned 实验；通用化时迁到 `packages/spark-ai-ui`”。如果坚持 `spark-component`，明确新增依赖和架构理由。
> 2. **改会话模型**：所有状态从 `alias` key 改为 `sessionKey = moduleId + moduleInstanceId`，事件也携带 `sessionId/moduleInstanceId`。
> 3. **改启动协议**：组件不从 registration 自动推导 input；调用方传入 `AiSessionMonitorEntry` 或 `AiSessionRunner`，由业务层构造合法 `AiJsonParams`。
> 4. **删/后置审批**：执行前审批先从 M1 移除；另开 spark-ai 设计，新增 `beforeFunctionCall` 后再做。
> 5. **收敛 M1 文件数**：先交付 trace/read-only + send/abort 的最小闭环，测试覆盖 `useSessionStream`、diagnostics、alias/sessionKey 分离、abort 本地状态。
> 6. **修验证命令**：使用 `pnpm --filter ... run typecheck/lint` 和定向 Vitest；避免默认完整 build。
>
> **一句话结论**：UI 方案可做，但必须先把“业务注册 alias”和“运行中 session”分开，把“工具执行后回调”和“执行前审批”分开。否则 Claude 后续实现会在最核心的数据流上踩空。
'@

$text = Add-After $text '# AiSessionMonitor 组件详细设计方案' $titleComment
$text = Add-After $text '### 1.2 目标' $goalComment
$text = Add-After $text '### 1.3 关键约束' $constraintsComment
$text = Add-After $text '## 二、文件结构' $fileStructureComment
$text = Add-After $text '### 3.1 根组件 Props (`AiSessionMonitor.props.ts`)' $propsComment
$text = Add-After $text '### 3.2 根组件 Emits (`AiSessionMonitor.types.ts`)' $emitsComment
$text = Add-After $text '### 3.3 流视图展示类型 (`SessionStreamView.types.ts`)' $streamTypeComment
$text = Add-After $text '## 四、组件树' $componentTreeComment
$text = Add-After $text '### 5.1 整体数据流' $dataFlowComment
$text = Add-After $text '### 5.2 流式数据缓冲（useSessionStream 核心逻辑）' $streamBufferComment
$text = Add-After $text '### 5.3 多模态输入处理' $multimodalComment
$text = Add-After $text '### 6.1 useSessionMonitor（编排中枢）' $monitorComment
$text = Add-After $text '### 6.2 useSessionStream（流缓冲）' $streamComposableComment
$text = Add-After $text '### 6.3 useSessionHistory（历史读取）' $historyComment
$text = Add-After $text '### 6.4 useSessionDiagnostics（诊断计算）' $diagnosticsComment
$text = Add-After $text '### 7.2 会话生命周期桥接' $lifecycleComment
$text = Add-After $text '### 7.3 工具审批流' $approvalComment
$text = Add-After $text '## 八、导出与注册' $exportComment
$text = Add-After $text '## 十、验证方案' $validationComment
$text = Add-After $text '## 十一、风险与开放问题' $riskComment
$text = $text.TrimEnd() + "`r`n" + $finalComment + "`r`n"

[System.IO.File]::WriteAllText($full, $text, [System.Text.UTF8Encoding]::new($false))
Write-Output "Annotated: $full"
Write-Output "Backup: $backup"
