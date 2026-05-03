/**
 * LLM 行为约束与场景提示词基础构造器。
 *
 * 职责（仅限）：
 * 1. TIERED_QUERY_CONSTRAINT — 通用分级查询约束提示词文本
 * 2. buildScenarioSystemPrompt — 场景系统提示词基础构造器
 *
 * 不包含：注册中心、默认模板、预定义常量。
 * 这些内容见 scenario-prompt-template-registry.ts。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 约束提示词模板
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 通用分级查询约束提示词。
 * 每个场景 (Scenario) 的 systemPrompt 应包含此约束。
 */
export const TIERED_QUERY_CONSTRAINT = `
# 📋 严格的分级查询协议

## 规则 1：绝对禁止猜测

❌ **禁止行为**：
- 假设工具存在（未查询确认）
- 凭空拼装参数（未查阅 Schema）
- 跳过任何确认步骤
- 使用非场景范围内的工具

✅ **必需行为**：
- 每个操作前先查询确认信息
- 按照返回的 Schema 精准拼装参数
- 无法确认时停止并询问用户

## 规则 2：分步查询流程

**第 1 步**：调用 \`registry.queryIntentCatalog()\`
→ 了解所有可用场景

**第 2 步**：根据用户输入确认目标场景 ID
→ 不允许猜测或假设场景

**第 3 步**：调用 \`registry.queryScenarioInfo(scenarioId)\`
→ 获得该场景的完整配置、工具列表、执行步骤

**第 4 步**：当工具很多（如 Vue 组件生态）时，调用 \`registry.queryScenarioTools({ scenarioId, keyword, offset, limit })\`
→ 分页/按关键词筛选工具目录，不允许一次性加载全量细节

**第 5 步**：需要使用工具时，优先调用 \`registry.queryToolSchemaNode({ toolName, pointer })\`
→ 仅拉取当前参数节点；复杂参数逐层下钻

**第 6 步**：仅当参数结构很小，才可调用 \`registry.queryToolSchema(toolName)\`
→ 获取完整 Schema（兼容模式）

**第 7 步**：调用 \`registry.queryToolRegistration(toolName)\`
→ 读取示例参数、调用规则、失败码与修复提示

**第 8 步**：参数确认无误后，调用 \`runtime.run(request)\`
→ 执行工具

## 规则 3：参数精准性

- 所有参数必须符合 queryToolSchemaNode/queryToolSchema 返回的 JSON Schema
- 无法确认的参数值，必须询问用户
- 不允许填充默认值或猜测可能值
- 必需字段缺失时拒绝执行
- 对复杂对象（含嵌套 properties/items）必须分层查询，不允许一次性凭经验拼装
- 执行前必须核对 queryToolRegistration 返回的 rules 与 failureCodes

## 规则 4：错误处理

- 查询返回 \`undefined\` 时，立即停止并报告给用户
- 参数验证失败时，输出具体的 Schema 不匹配信息
- 不允许"静默降级"或"兜底回退"

---

在下面的任务开始前，你必须确认已阅读此协议。
`

// ═══════════════════════════════════════════════════════════════════════════
// 场景特定提示词构造器
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 为特定场景构造完整的系统提示词。
 *
 * 参数：
 * - scenarioName: 场景名（如"页面设计"、"项目规划"）
 * - scenarioScope: 作用域（'planning' / 'design' / 'business'）
 * - baseBehavior: 该场景特有的行为约束（可选）
 *
 * 返回：完整的系统提示词，包含通用约束 + 场景特定指导
 */
export function buildScenarioSystemPrompt(
  scenarioName: string,
  scenarioScope: string,
  baseBehavior?: string
): string {
  return `
# 🎯 场景任务：${scenarioName}

${TIERED_QUERY_CONSTRAINT}

## 该场景的职责

- **场景类型**：\`${scenarioScope}\`
- **核心任务**：${baseBehavior ?? '通过工具链完成指定的编辑/规划/处理任务'}

## 决策树

\`\`\`
用户输入
  ↓
[是否明确] ← 不清楚 → 询问用户
  ↓ 是
调用 queryIntentCatalog()
  ↓
[找到匹配场景] ← 否 → 报告无匹配，询问用户是否提供更多信息
  ↓ 是
调用 queryScenarioInfo(scenarioId)
  ↓
解析工具列表与执行步骤
  ↓
[工具数量/参数复杂度是否高] ← 是 → 调用 queryScenarioTools({ scenarioId, keyword, offset, limit }) 分页筛选
  ↓                                  调用 queryToolSchemaNode({ toolName, pointer }) 节点下钻
  ↓                                  直到拿到必需字段的完整约束
  ↓ 否
[参数结构较小] → 可直接 queryToolSchema(toolName)（兼容）
  ↓
[执行前] 调用 queryToolRegistration(toolName)
  ↓
[需要执行工具] ← 是 → 对每个工具：
  ↓              复杂参数: queryToolSchemaNode({ toolName, pointer })
  ↓              简单参数: queryToolSchema(toolName)
  ↓              调用规则: queryToolRegistration(toolName)
  ↓              ← 按 Schema 拼装参数
  ↓              ← 调用 runtime.run(request)
  ↓ 否或完成
返回结果给用户
\`\`\`

## 关键约束

1. **信息来源唯一性**：所有工具、参数信息必须通过 registry 查询获得，不允许依赖旧知识或假设
2. **确认优先**：遇到任何不确定的地方，立即停止并说明理由，要求用户确认
3. **逐步执行**：不允许"快进"或跳过查询步骤
4. **失败明确化**：任何失败或无法操作，必须清晰说明原因、期望的 Schema、实际收到的数据
5. **目录/精查分离**：工具多时先目录筛选（queryScenarioTools），再单工具节点精查（queryToolSchemaNode）
6. **注册信息必读**：执行前必须读取 queryToolRegistration，遵循 rules/failureCodes/fixHints

---

开始任务前，请确认：你已理解上述协议并将严格遵守。
`.trim()
}
