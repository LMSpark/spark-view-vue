/**
 * PageDesign module-semantic 业务注册。
 *
 * PageDesign 只注册到 Host 一次(moduleId=pageDesign),内部暴露 5 个扁平 kind:
 * lifecycle / text-model / payload-catalog / node-tree / dataset。
 *
 * LLM 固定走 6 个协议工具:
 * listChildren("/") → findInstance("/", kind, {}) → describeKind(kind) →
 * invokeAction("/<kind>[<pageId>]", actionName, args)。
 */

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRegistry,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
import {
  ModuleSemanticRuntime,
  type ModuleKind,
} from '@spark-view/spark-ai/module-semantic'
import {
  PageDesignService,
  type PageDesignEditHost,
  type PageDesignServiceContext,
} from '../capabilities/page-edit-session'
import { summarizePageDesignFlowPhases } from '../capabilities/page-design-artifacts'
import { PageDesignDatasetModuleKind } from './dataset-tool-catalog'
import { PageDesignLifecycleModuleKind } from './lifecycle-tool-catalog'
import { PageDesignNodeTreeModuleKind } from './node-tree-tool-catalog'
import { PageDesignPayloadCatalogModuleKind } from './payload-catalog-tool-catalog'
import { PageDesignTextModelModuleKind } from './text-model-tool-catalog'
import { createLeaveRequestBusinessRegistration } from './leave-request'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

const AI_FUNCTION_ARCHITECTURE_PROMPT = `══ AI Host: module-semantic boundary ══

  - Host 只暴露 6 个稳定协议工具：listChildren、findInstance、describeKind、invokeAction、getAttribute、setAttribute。
  - 当前业务使用扁平 kind：lifecycle / text-model / payload-catalog / node-tree / dataset。
  - 先用 listChildren("/") 发现 kind，再用 findInstance("/", kind, {}) 取得当前业务实例，再用 describeKind(kind) 查看 action 细节。
  - 调用业务动作统一使用 invokeAction(path, actionName, args)，path 形如 /<kind>[<当前页面ID>]。
  - AI 会话宿主负责模型通讯、tool schema 投影、函数选择、重试、追问、暂停与恢复。
  - Host 负责 AI 会话记录、协议工具调用记录和执行结果回传给 LLM。
  - 调用链路是：pageDesign 业务注册 -> Host 会话 -> LLM 编排协议工具 -> ModuleSemanticRuntime 路由 -> pageDesign ModuleKind.runner 执行。
  - AI 会话按 pageDesign 注册 ID + 当前根页面实体 ID 隔离；instanceId 只是技术 envelope。
  - ModuleSemanticRuntime 不保存 active path 业务状态，也不依据函数结果做下一步编排。
  - 模块服务自管生命周期与 live state；业务 release 只清 live state，不删除会话历史。
  - instanceId 只是宿主技术 envelope，不进入函数 args，也不由 LLM 自行拼接。`

const PAGE_DESIGN_FLOW_PHASES = summarizePageDesignFlowPhases()

function formatPageDesignFlowPhases(): string {
  return PAGE_DESIGN_FLOW_PHASES
    .map((phase) => `${phase.phase}(${phase.firstStep}-${phase.lastStep})`)
    .join(' -> ')
}

const PAGE_DESIGN_FLOW_PROMPT = `【页面设计 100 步流程】
- 页面设计流程真源来自 spark-page-config/capabilities/design/page-design-100-step-flow。
- 阶段顺序：${formatPageDesignFlowPhases()}。
- 复杂修改开始前先调用 lifecycle.describeDesignFlow({}) 或按 phase / step / afterStep 查询当前位置。
- 不要在 prompt 中重新发明流程；以 lifecycle.describeDesignFlow 返回的 phases / steps / nextStep 为准。`

const DATA_FIRST_POLICY_PROMPT = `【数据优先（模型级）】
- 数据优先是硬约束：先完成 DataSet 模型，再考虑 UI/脚本。
- 在数据阶段完成前，不得调用 node-tree 写 action、text-model.writeScript 或 text-model.writeStyle。
- 数据阶段收敛后，直接进入页面结构与脚本阶段。`

const DATA_FIRST_SEQUENCE_PROMPT = `【最小执行序列】
1) dataset 函数（可多次）
2) node-tree action / text-model.write*`

export type PageDesignModuleKindId =
  | 'lifecycle'
  | 'text-model'
  | 'payload-catalog'
  | 'node-tree'
  | 'dataset'

export type PageDesignRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

export type PageDesignModuleOptions = {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

export function createPageDesignBusinessRegistration(
  options: PageDesignModuleOptions,
): AiHostBusinessRegistration {
  const service = new PageDesignService({
    getEditHost: (context) => options.getEditToolHost({
      instanceId: context.requestId,
      moduleId: PAGE_DESIGN_MODULE_ID,
      moduleInstanceId: context.pageId,
    }),
  })
  const runtime = new ModuleSemanticRuntime()

  runtime.registerKind(new PageDesignLifecycleModuleKind({
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(new PageDesignTextModelModuleKind({
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(new PageDesignPayloadCatalogModuleKind())
  runtime.registerKind(new PageDesignNodeTreeModuleKind({
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(new PageDesignDatasetModuleKind({
    service,
    contextFactory: toServiceContext,
  }))

  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。',
    runtime,
    sessionStore: new DefaultAiHostSessionStore(),
    systemPrompt: createPageDesignSystemPrompt,
    afterFunctionCall: (call) => {
      const unavailableMessage = pageDesignEditHostUnavailableMessage(call.result)
      if (unavailableMessage !== null) {
        return {
          status: 'abort',
          reason: 'page design edit host unavailable',
          finalAssistantMessage: unavailableMessage,
          releaseInstance: true,
        }
      }
      return { status: 'continue' }
    },
    releaseModuleInstance: (moduleInstanceId) => {
      service.releasePage(moduleInstanceId)
    },
  }
}

function createPageDesignSystemPrompt(): string {
  return `${AI_FUNCTION_ARCHITECTURE_PROMPT}

══ pageDesign: 四文件直接编辑 ══

  当前会话已由宿主完成 lifecycle.bootstrap，真实上下文就是当前页面的 4 个文件：
  - rule.json
  - pagedata.json
  - script.js
  - style.css

  本模式是“直接编辑”，不是“需求调研 / 方案审阅 / 蓝图推进”：
  - 禁止生成确认问卷、禁止等待“用户批准后执行”
  - 禁止输出或调用任何 blueprint.* 动作
  - 禁止把任务拆成 blueprint checkpoint / plan item
  - 不要复述蓝图流程；直接围绕当前请求执行最小必要修改

  信息不足时的处理原则：
  - 先用只读动作补足上下文，不要先向用户发问
  - 只有关键业务事实既无法从当前 4 文件、也无法从只读动作判定时，才用自然语言向用户做最小澄清
  - 能直接改就直接改，不走“先出完整方案再执行”的流程

══ pageDesign: 函数纪律 ══

  - 只使用当前 tool schema 中的协议工具；业务动作必须通过 invokeAction 调用
  - 当前会话仅允许 pageDesign kind：lifecycle / text-model / dataset / node-tree / payload-catalog
  - 禁止调用生成模式动作：datatable.* / dataview.* / relation.* / schema.*
  - 在本会话中，如遇 NO_DATASET_EDIT / NO_NODE_TREE，请基于当前会话状态继续修复
  - 首轮可调用 lifecycle.describeProgress 了解当前状态；复杂页面设计先调用 lifecycle.describeDesignFlow 查询 100 步流程；函数参数以当前投影的 tool schema 和 description 为准，之后不要重复能力探测
  - 构造或替换 SparkNode 前，必须先调用 guidePayload 获取目标组件 type 的参数荷载指南
  - 函数执行结果由当前 LLM 轮次自行解读；若返回错误，先读 code / msg / fix，再按当前 tool schema 和修复建议重试
  - 若 guidePayload 返回 PAYLOAD_NOT_FOUND（组件不存在），同一 key 禁止再次 guide 重试；必须先 queryPayloads 选择可用替代组件
  - 若 node-tree 的 listChildren/getNode 报“节点不存在”，禁止据此宣称 rule.json 为空；必须先用 listChildren(parentComponentId:null) 或 countNodes/getAllData 做根级核验
  - 只有在 countNodes=1 且 listChildren(parentComponentId:null) 返回 0 个子节点时，才可认定 rule.json 为空；否则禁止输出“无页面结构/空页面”结论

  按目标文件选择动作：
  - 修改 rule.json：使用 node-tree action；新增组件前先 queryPayloads({ category: 'container' }) 或 queryPayloads({ keyword: '...' })，选定 type 后再 guidePayload({ key: type })；调整已有节点位置优先用 moveNode，禁止用 removeNode + addNode 重建整段子树
    ⚠ componentId 规则（违反则工具返回 null，造成死循环）：
      • componentId / parentComponentId 必须是节点的真实 id 值
        （即 listChildren 返回 SparkNode 中的顶层 id 字段）
      • 绝对禁止将组件类型名（r-table / r-tabs / r-text / r-select / r-date 等）当作 componentId 传入
      • 若不知道目标节点 id，按优先级选择：
        ① 优先调用 findByType({ type: 'r-tabs' }) 按类型一步拿到真实 id
        ② 或调用 listChildren({parentComponentId:null}) 逐层遍历，
           从每个节点的顶层 id 字段读取真实 id，再调用 getNode / setProps / moveNode / removeNode
    ⚠ DataViewKey详细约束（rule 编辑必须遵守）：
      • 所有 DataView 定位只写 dataViewKey：table@viewId、#scope@table@viewId；严禁省略 viewId
      • DataView 输出读取必须拆成 dataViewKey + dataMember + dataField；dataMember 只允许枚举字符串 rows / columns / currentRow / selectedRows / aggregateResult / selectionAggregateResult / total / page / pageSize / requestState / mutating / loadingError / mutatingError
      • dataField 只用于对象型成员 currentRow / aggregateResult / selectionAggregateResult，允许点路径，如 dataViewKey: "stats@default", dataMember: "currentRow", dataField: "totalUsers"
      • rows / selectedRows 这类集合成员不能追加字段路径
      • r-table / r-list / r-tree / r-filter 用 dataViewKey 定位 DataView，通常不需要 dataMember
      • r-form / r-detail 用 dataViewKey 定位 DataView，用 contextDataMember 和 contextDataField 选择上下文值；默认 contextDataMember 是 currentRow，也可配置 aggregateResult / selectionAggregateResult
      • 展示组件、字段候选项、toolbar/action 的上下文值读取使用 dataViewKey + dataMember + dataField；字段列和表单字段通常在容器上下文中使用 field
      • 数据容器提供 DATA_ROW 后，任意组件的任意 prop 都可以用 $[fieldName] 读取当前行字段；例如 r-tag.content="$[age] 岁"、r-tag.tagType="$[ageBadgeType]"、r-statistic.title="$[name] 的年龄"
      • 纯 $[fieldName] 保留字段原始类型；混合文本会字符串化；它只消费当前行字段，不替代 dataViewKey / dataMember / dataField / field
      • DataViewKey 只接受 table@viewId 或 #scope@table@viewId，不接受链式对象路径
      • 若不确定应绑定哪个 table / viewId / member / field，先调用 collectDataViewKeys 或读取同类节点，复用当前页面现有 dataViewKey 模式
  - 修改 pagedata.json：使用 dataset 函数
  - 修改 script.js：使用 text-model 的 readScript / writeScript
    ⚠ script.js 沙箱运行时契约（写入前必须遵守）：
      • $page 只用于页面服务：showMessage / showConfirm / showPrompt / showAlert / showLoading / navigate
      • 数据入口是 $dataSet：使用 $dataSet?.getView('TableName', 'default')，读取 view.rows / view.currentRow，写入 view.appendRow / view.updateRowById / view.deleteRowById
      • 组件入口是 $components.getApi('component-id')：dialogApi.open()/close()，formApi.getFormData()/setFieldValue()/resetFields()，tableApi.getRows()/query()/refresh()
      • 禁止伪造 $page 数据/组件 API：$page.getDataSet、$page.getTableRows、$page.getTableData、$page.getViewData、$page.setFieldValue、$page.getFieldValue、$page.setFormData、$page.getFormData、$page.clearForm、$page.createRow、$page.updateRow、$page.deleteRow、$page.refreshTable、$page.showDialog('id')、$page.hideDialog('id')、$page.confirm
      • DataView 没有 getRows()/setSummaryRow()；rows 是属性，aggregateResult 由 aggregates 自动计算
      • Element Plus table size 只允许 default / small / large，禁止 medium
  - 修改 style.css：使用 text-model 的 readStyle / writeStyle

  执行目标：
  - 只做满足当前请求的最小必要修改
  - 保持 4 文件之间的一致性，不做无关重写
  - 需求完成后立即停止工具调用并给出简短总结

${DATA_FIRST_POLICY_PROMPT}

${PAGE_DESIGN_FLOW_PROMPT}

${DATA_FIRST_SEQUENCE_PROMPT}
`
}

function toServiceContext(ctx: ModuleKind.PathContext | AiHostBusinessRuntimeContext): PageDesignServiceContext {
  if ('host' in ctx || 'segment' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment.id,
      pageId: currentPageId(pathCtx),
    }
  }
  return {
    requestId: ctx.instanceId,
    pageId: ctx.moduleInstanceId,
  }
}

function currentPageId(ctx: ModuleKind.PathContext): string {
  return ctx.host?.moduleInstanceId ?? ctx.segment.id
}

function pageDesignEditHostUnavailableMessage(result: AiHostFunctionCallResult<unknown>): string | null {
  if (result.ok || (result.code !== 'EXECUTE_ERROR' && result.code !== 'ACTION_EXECUTE_ERROR')) return null
  const message = result.msg.trim()
  if (message === '') return null
  if (message.includes('PageDesign edit host unavailable')) return message
  if (message.includes('PageDesign edit host is not registered')) return '请先在开发系统中打开并选中目标配置页面。'
  if (message.includes('请先在开发系统中打开并选中目标配置页面')) return message
  return null
}

// ── 业务注册入口（原 assistant-businesses.ts）─────────────────────

export type RegisterAssistantBusinessesOptions = {
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost?: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
}

export function registerAssistantBusinesses(options: RegisterAssistantBusinessesOptions): void {
  options.registry.register(createLeaveRequestBusinessRegistration())

  if (options.getPageDesignEditHost === undefined) return

  options.registry.register(createPageDesignBusinessRegistration({
    getEditToolHost: (context) => options.getPageDesignEditHost?.(context) ?? missingPageDesignEditHost(),
  }))
}

function missingPageDesignEditHost(): never {
  throw new Error('PageDesign edit host unavailable: 请先在开发系统中打开并选中目标配置页面。')
}
