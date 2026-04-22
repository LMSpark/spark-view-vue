import type { IDataSetMetadata } from '@spark-view/spark-data'

export interface FineGrainedEditContext {
  dataSetName: string
  tableCount: number
  relationCount: number
  tables: Array<{
    tableName: string
    columns: Array<{ name: string; type: string; isPrimaryKey: boolean }>
    primaryKeys: string[]
  }>
  relations: Array<{
    parentTable: string
    parentField?: string
    childTable: string
    childField?: string
  }>
  pageContext: {
    ruleNodeCount: number
    scriptJsPreview: string
    styleCssPreview: string
  }
}

export interface FineGrainedTurnSummary {
  phase: string
  toolBlock?: { action: string } | undefined
  aiText?: string | undefined
}

export const DATASET_FINE_EDIT_TOOL_ACTIONS = [
  'session.describe',
  'stills.capabilities',
  'stills.actionSpec',
  'sparkNodeTree.getNode',
  'sparkNodeTree.getParent',
  'sparkNodeTree.listChildren',
  'sparkNodeTree.countNodes',
  'sparkNodeTree.collectDataKeys',
  'sparkNodeTree.collectHandlerNames',
  'file.readScript',
  'file.readStyle',
  'datasetTool.createTable',
  'datasetTool.updateTable',
  'datasetTool.deleteTable',
  'datasetTool.renameTable',
  'datasetTool.createColumn',
  'datasetTool.updateColumn',
  'datasetTool.deleteColumn',
  'datasetTool.renameColumn',
  'datasetTool.createRelation',
  'datasetTool.updateRelation',
  'datasetTool.deleteRelation',
] as const

export function buildFineGrainedEditContext(
  metadata: IDataSetMetadata,
  pageContext: FineGrainedEditContext['pageContext'],
): FineGrainedEditContext {
  const tableEntries = Object.entries(metadata.tables)
  const tables = tableEntries.map(([tableName, table]) => {
    const columns = table.columns.map((column) => ({
      name: column.name,
      type: column.type,
      isPrimaryKey: Boolean(column.isPrimaryKey),
    }))
    return {
      tableName,
      columns,
      primaryKeys: columns.filter(col => col.isPrimaryKey).map(col => col.name),
    }
  })

  const relations = (metadata.tableRelations ?? []).map((rel) => {
    const relation = {
      parentTable: rel.parentTable,
      childTable: rel.childTable,
      ...(typeof rel.parentField === 'string' ? { parentField: rel.parentField } : {}),
      ...(typeof rel.childField === 'string' ? { childField: rel.childField } : {}),
    }
    return relation
  })

  return {
    dataSetName: metadata.dataSetName,
    tableCount: tables.length,
    relationCount: relations.length,
    tables,
    relations,
    pageContext,
  }
}

export function buildFineGrainedLoopSystemPrompt(): string {
  return `你是 SPARK DataSet 模型级编辑代理，工作在 edit-domain 的 stills Function Calling 模式。

严格执行以下流程：
1. 先自举（只在会话初期做一次）：必须先调用 session.describe 或 stills.capabilities，读取 FC 能力目录与当前阶段。
2. 任何写操作之前，必须先调用 stills.actionSpec 查询目标动作的参数 schema、guard、失败模式。
3. 前置查询后，立即进入最小必要修改；不要在每一轮重复 session.describe / stills.capabilities。
4. 当前会话已用同页 4 文件（rule.json / pagedata.json / script.js / style.css）完成 bootstrap；pagedata 编辑不是孤立模型编辑。
5. 允许使用只读动作理解 4 文件语境：sparkNodeTree.getNode / sparkNodeTree.getParent / sparkNodeTree.listChildren / sparkNodeTree.countNodes / sparkNodeTree.collectDataKeys / sparkNodeTree.collectHandlerNames / file.readScript / file.readStyle。
6. 只允许使用最小必要的 datasetTool.* 动作编辑 pagedata.json 对应的数据模型。
7. 如果需求与页面字段绑定、事件处理器、脚本逻辑或样式约束相关，先读取对应只读上下文，再决定 datasetTool.* 修改。
8. 严禁在此模式下修改 rule.json / script.js / style.css；不要调用 sparkNodeTree 写动作、file.writeScript、file.writeStyle、edit.exportFiles。
9. 如果需求涉及新增/修改/删除数据表（例如新增联系人从表），优先使用 datasetTool.createTable / updateTable / deleteTable。
10. 如果用户只是新增/修改/删除字段，优先使用 datasetTool.createColumn / updateColumn / deleteColumn。
11. 如果需求涉及主从关系，优先使用 datasetTool.createRelation / updateRelation / deleteRelation。
12. 完成修改后，必须调用 dataset.export 导出 pagedata.json，然后结束本轮。
13. 你必须自愈：当 tool result 返回错误或 warnings 时，先阅读错误里的 code/msg/fix，再重新查询相关 stills.actionSpec，然后用修正后的最小参数重试。
14. 如果当前理解不够，不要臆测结构、不要补全未给出的参数；优先用 stills.actionSpec 或允许的只读动作补足上下文。
15. 禁止重复发送同一 action + 同一参数；重试时必须体现已根据上一次 tool result 做出修正。
16. 当需求已经完成时，立即停止工具调用并输出简短总结，不要继续无关 describe/request。

输出策略：
- 有 tool 可调用时，不要只给文字结论。
- 当数据修改目标完成后即可输出最终简短总结。`
}

export function buildFineGrainedLoopUserPrompt(userPrompt: string, context: FineGrainedEditContext): string {
  return `请在当前页面的 4 文件同层上下文中，对 DataSet 做模型级增量编辑；真实写入只允许落在 pagedata.json 对应的数据模型。

用户需求：
${userPrompt}

当前模型摘要：
${JSON.stringify(context, null, 2)}

要求：
- 当前会话已经带有同页 rule.json / pagedata.json / script.js / style.css。
- 若需求依赖页面结构、dataKey、handler、脚本逻辑或样式约束，先读取对应只读上下文，不要把 pagedata 当成孤立文件。
- 保持现有表、列、关系不被无关重写。
- 修改前先查能力目录和 actionSpec。
- 完成后直接结束，由宿主自动同步当前模型。`
}

export function summarizeFineGrainedTurns(turns: FineGrainedTurnSummary[]): string {
  const actions: string[] = []
  for (const turn of turns) {
    if (turn.phase === 'stills-execute' && turn.toolBlock) {
      actions.push(turn.toolBlock.action)
    }
  }
  const uniqueActions = [...new Set(actions)]
  
  let finalText: string | undefined
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t?.phase === 'ai-response' && t.aiText) {
      finalText = t.aiText.trim()
      break
    }
  }
  
  const actionSummary = uniqueActions.length > 0 ? `执行动作：${uniqueActions.join(' -> ')}` : '已完成工具编排执行'
  return finalText ? `${actionSummary}

${finalText}` : actionSummary
}