/**
 * PageDesign module-semantic 业务注册。
 *
 * PageDesign 只注册到 Host 一次(moduleId=pageDesign),内部暴露 1 个根 kind 和 5 个子 kind:
 * pageDesign -> lifecycle / text-model / payload-catalog / node-tree / dataset。
 *
 * LLM 固定走 6 个协议工具:
 * listChildren("/") → findInstance("/", "pageDesign", {}) →
 * listChildren("/pageDesign[<pageId>]") → describeKind(childKind) →
 * invokeAction("/pageDesign[<pageId>]/<childKind>[<pageId>]", actionName, args)。
 */

import {
  DefaultAiHostSessionStore,
  type AiHostBusinessRegistration,
  type AiHostBusinessRegistry,
  type AiHostBusinessRuntimeContext,
  type AiHostFunctionCallResult,
} from '@spark-view/spark-ai/host'
import {
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  type ModuleInstanceRef,
} from '@spark-view/spark-ai/module-semantic'
import type { ModulePathContext } from '@spark-view/spark-ai/module-semantic'
import type {
  PageDesignEditHost,
  PageDesignServiceContext,
} from '../design'
import { PageDesignService } from '../design'
import { PageDesignDatasetModuleKind, DATA_FIRST_POLICY_PROMPT, DATA_FIRST_SEQUENCE_PROMPT } from './dataset-tool-catalog'
import { PageDesignLifecycleModuleKind, PAGE_DESIGN_FLOW_PROMPT } from './lifecycle-tool-catalog'
import { PageDesignNodeTreeModuleKind } from './node-tree-tool-catalog'
import { PageDesignPayloadCatalogModuleKind, createPageDesignPayloadRegistry } from './payload-catalog-tool-catalog'
import { PageDesignTextModelModuleKind } from './text-model-tool-catalog'
import { createLeaveRequestBusinessRegistration } from './leave-request'
import {
  PAGE_DESIGN_CHILD_MODULES,
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_ROOT_KIND,
} from './page-design-kind-ids'

export const PAGE_DESIGN_MODULE_ID = PAGE_DESIGN_ROOT_KIND

const AI_FUNCTION_ARCHITECTURE_PROMPT = `══ AI Host: module-semantic boundary ══

  - Host 只暴露 6 个稳定协议工具：listChildren、findInstance、describeKind、invokeAction、getAttribute、setAttribute。
  - 当前业务根 kind 是 pageDesign，子 kind 是 lifecycle / text-model / payload-catalog / node-tree / dataset。
  - 先用 listChildren("/") 发现 pageDesign，再用 findInstance("/", "pageDesign", {}) 取得当前业务实例。
  - 子模块发现使用 listChildren("/pageDesign[<当前页面ID>]") 或 findInstance("/pageDesign[<当前页面ID>]", childKind, {})。
  - 调用业务动作统一使用 invokeAction(path, actionName, args)，推荐路径形如 /pageDesign[<当前页面ID>]/<childKind>[<当前页面ID>]。
  - 子模块路径必须带实例段：正确 /pageDesign[page-a]/lifecycle[page-a]，错误 /pageDesign[page-a]/lifecycle。
  - AI 会话宿主负责模型通讯、tool schema 投影、函数选择、重试、追问、暂停与恢复。
  - Host 负责 AI 会话记录、协议工具调用记录和执行结果回传给 LLM。
  - 调用链路是：pageDesign 业务注册 -> Host 会话 -> LLM 编排协议工具 -> ModuleSemanticRuntime 路由 -> pageDesign ModuleKind 协议方法执行。
  - AI 会话按根 kind + 当前根页面实体 ID 隔离，后端 sessionId 由 Host 生成。
  - ModuleSemanticRuntime 不保存 active path 业务状态，也不依据函数结果做下一步编排。
  - 模块服务自管生命周期与 live state；业务 release 只清 live state，不删除会话历史。
  - instanceId 是当前根页面实体 ID，不进入函数 args，也不由 LLM 自行拼接 sessionId。`

const PAGE_DESIGN_COMMON_COMPONENT_PROMPT = `══ pageDesign: 组件参数荷载指南纪律 ══

  LLM 写目录组件前必须先显式调用 payload-catalog.guidePayload({ key: type })，每个计划写入的目录组件 type 至少成功 guide 一次；同一 type 已成功 guide 后不要重复 guide。
  为了减少轮次，先列出本次页面要用的组件 type，并在同一轮并行调用多个 guidePayload；拿到指南后再一次性 node-tree.addNodes 写完整页面骨架。
  node-tree 写动作也会根据每个 SparkNode.type 自动提取 payload-catalog 指南，并按指南兜底校验 props；参数错误时工具会返回具体 code/msg/fix/checks，必须按错误内容修正后重试。
  pageDesign AI 优先写入 payload-catalog 中可查询到的组件 type；组件目录内的非 r-* 类型同样合法，标准 HTML 标签合法且不需要 guidePayload，目录外未知业务 type 会被 node-tree 写入前拦截，避免落入渲染 fallback。
  下面是申请类表单常见组件及常用 props，只能作为选型快捷参考，正式写入前仍必须 guidePayload：
  - r-section: title / description / gridColumns / gridGap / bodyClass / useCard
  - r-card: header / shadow / bodyStyle / bodyClass
  - r-form: dataViewKey / contextDataMember / contextDataField / gridColumns / gridGap / labelWidth / toolbar
  - r-text: field / label / placeholder
  - r-select: field / label / placeholder / options / optionDataViewKey / optionDataMember / optionLabelField / optionValueField
  - r-date: field / label / placeholder / valueFormat / dateType
  - r-number: field / label / placeholder / min / max / precision
  - r-textarea: field / label / placeholder / rows / maxlength / showWordLimit
  - r-button: action / label / buttonType / icon
  - r-table: dataViewKey / dataMember / rowKey / autoColumns / stripe / border / showPagination / toolbar / actions

  简单新表单页优先按“dataset -> guidePayload 覆盖所有目录组件 type -> node-tree.addNodes”的顺序收敛；只有 type 不确定、组件不存在或校验失败时，才调用 queryPayloads 定位替代组件。`

const PAGE_DESIGN_APPLICATION_FORM_PROMPT = `══ pageDesign: 申请类表单页一轮收敛模板 ══

  当用户请求类似“实现/设计 xxx 申请页面”（包括“请假申请页面设计”）时，按申请类表单页闭环处理，不要停在数据模型阶段：
  1. dataset.createTable 创建主业务表，字段至少包含 id、applicant/applicantName、leaveType/type、startDate、endDate、days、reason、status。
  2. dataset.createTable 创建类型/字典表，resourceType 使用 static-data，default.rows 至少给出年假、病假、事假、调休等选项；视图使用 default。
  3. 主表必须有 default 视图；还要有 pending/approval 等待审批列表视图，status=pending，并配置 count 聚合用于统计。
  4. 进入 UI 阶段后必须调用 node-tree.addNodes 写 rule.json，至少包含统计区、申请表单区、待审批列表区。
  5. UI 写入前，必须对本次 rule.json 会出现的每个目录组件 type 显式 guidePayload；如果使用 data-view-meta-bar、display-statistic 等非 r-* 目录组件，也必须 guidePayload。
  6. 表单区使用 r-form 绑定主表 default 视图，并显式写 contextDataMember: "currentRow"；字段节点绑定申请人、请假类型、开始日期、结束日期、请假天数、请假事由，包含提交按钮。
  7. 请假类型字段使用 r-select，并绑定类型字典表 default 视图或使用静态 options。
  8. 待审批区使用 r-table 或 r-list 绑定主表 pending/approval 视图。
  9. 写完 pagedata.json 和 rule.json 后再按需写 style.css；完成后立即总结，不继续做无关读取。
  10. 如果数据表已创建而 rule.json 仍是默认占位 div/h2/p，下一步必须直接 removeNode 删除占位容器，guidePayload 覆盖所有计划组件 type 后，用 node-tree.addNodes(parentComponentId:null) 一次写入统计区、表单区和待审批列表区。

  推荐 DataViewKey：
  - 主表 default: LeaveRequest@default 或 LeaveRequests@default
  - 待审批视图: LeaveRequest@pending 或 LeaveRequests@pending
  - 类型字典: LeaveType@default 或 LeaveTypeOptions@default

  硬性写入约束：
  - 在 pagedata.json 尚无业务表时，禁止调用 node-tree.addNode/addNodes/replaceNode/replaceNodes 写页面组件。
  - node-tree 写入的每个 SparkNode 都必须有稳定顶层 id；后续 componentId 只使用这些真实 id，不猜自动 id。
  - r-form/r-detail 使用 dataViewKey 时必须显式写 props.contextDataMember: "currentRow"；不要只写 dataMember。
  - 禁止只写空 r-section/r-form 容器；addNodes 必须一次写入完整子树，包含字段、按钮、统计和列表绑定。
  - 如果初始 rule.json 只有默认占位 div/h2/p（文案类似“页面配置就绪”），先 removeNode 删除占位容器，再写入正式页面结构。`

export type PageDesignRuntimeContext = {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

export type PageDesignModuleOptions = {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

// PAGE_DESIGN_AI_TRACE[page-design-registration]: spark-page-config 拥有 pageDesign AI 业务注册；这里把 lifecycle/text-model/payload-catalog/node-tree/dataset 五个子工具挂到 AI Host。
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
  const payloadRegistry = createPageDesignPayloadRegistry()

  runtime.registerKind(new PageDesignRootModuleKind())
  runtime.registerKind(new PageDesignLifecycleModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.registerKind(new PageDesignTextModelModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))
  runtime.registerKind(new PageDesignPayloadCatalogModuleKind({
    parentKind: PAGE_DESIGN_ROOT_KIND,
    registry: payloadRegistry,
    service,
    contextFactory: toServiceContext,
  }))
  runtime.registerKind(new PageDesignNodeTreeModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
    payloads: [
      {
        payloadRef: PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
        description: 'SparkNode 组件 props 参数目录；LLM 写目录组件前必须显式 guidePayload，node-tree 写入时也会按 type 自动提取指南并兜底校验 props。',
        requiredForActions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ],
  }))
  runtime.registerKind(new PageDesignDatasetModuleKind({
    service,
    contextFactory: toServiceContext,
    parentKind: PAGE_DESIGN_ROOT_KIND,
  }))

  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    name: 'Page Design',
    description: '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。',
    runtime,
    sessionStore: new DefaultAiHostSessionStore(),
    systemPrompt: createPageDesignSystemPrompt,
    onStartSession: (context) => {
      const bootstrap = service.bootstrap(toServiceContext(context))
      if (!bootstrap.ok) {
        throw new Error(bootstrap.msg)
      }
    },
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

${PAGE_DESIGN_COMMON_COMPONENT_PROMPT}

${PAGE_DESIGN_APPLICATION_FORM_PROMPT}

══ pageDesign: 四文件直接编辑 ══

  当前会话已由宿主完成 lifecycle.bootstrap，真实上下文就是当前页面的 4 个文件：
  - rule.json
  - pagedata.json
  - script.js
  - style.css
  不要把 bootstrap 当成常规第一步重复调用；只有工具结果明确提示需要重新 bootstrap 时才调用。

  本模式是“直接编辑”，不是“需求调研 / 方案审阅 / 蓝图推进”：
  - 禁止生成确认问卷、禁止等待“用户批准后执行”
  - 禁止输出或调用任何 blueprint.* 动作
  - 禁止把任务拆成 blueprint checkpoint / plan item
  - 不要复述蓝图流程；直接围绕当前请求执行最小必要修改
  - 对“实现/创建/设计页面”类请求，必须实际调用 dataset / node-tree / text-model 写动作修改当前四文件；如果本轮没有任何工具调用或没有写入结果，禁止宣称“已完成”
  - 只有在工具结果显示 pagedata.json、rule.json、script.js 或 style.css 已经被真实写入后，才允许输出完成总结

  信息不足时的处理原则：
  - 先用只读动作补足上下文，不要先向用户发问
  - 只有关键业务事实既无法从当前 4 文件、也无法从只读动作判定时，才用自然语言向用户做最小澄清
  - 能直接改就直接改，不走“先出完整方案再执行”的流程

══ pageDesign: 函数纪律 ══

  - 只使用当前 tool schema 中的协议工具；业务动作必须通过 invokeAction 调用
  - 当前会话仅允许 pageDesign 根 kind 及其子 kind：lifecycle / text-model / dataset / node-tree / payload-catalog
  - 禁止调用生成模式动作：datatable.* / dataview.* / relation.* / schema.*
  - 在本会话中，如遇 NO_DATASET_EDIT / NO_NODE_TREE，请基于当前会话状态继续修复
  - 首轮可调用 lifecycle.describeProgress 了解当前状态；复杂页面设计先调用 lifecycle.describeDesignFlow 查询 100 步流程；函数参数以当前投影的 tool schema 和 description 为准，之后不要重复能力探测
  - 简单新表单页不需要完整走完 100 步；用最短闭环完成：dataset.createTable -> payload-catalog.guidePayload 覆盖目录组件 type -> node-tree.addNodes -> 必要时 text-model.writeStyle -> 简短总结
  - describeKind("node-tree") 返回的 payloads 是参数指南引用；写目录组件前必须先对每个将出现的 type 调用 payload-catalog.guidePayload，node-tree 写动作仍会按 SparkNode.type 自动提取指南并校验 props 作为兜底
  - 表单字段组件优先使用目录中真实存在的 r-text / r-select / r-date / r-number / r-textarea；不要猜 r-input
  - rule.json 新增/替换节点优先使用 payload-catalog 可返回指南的组件；组件目录内的非 r-* 类型同样合法，标准 HTML 标签合法，目录外未知业务 type 禁止写入
  - 完成必要写入后立即停止工具调用并总结；不要把 export、getAllData、readScript、readStyle、listRows 当作收尾自检，除非前一步返回错误需要定位
  - 函数执行结果由当前 LLM 轮次自行解读；若返回 ok:false，必须先读取 code / msg / fix / checks，按参数校验结果和当前 tool schema 修正后重试失败动作，禁止把失败调用当成成功继续推进或宣称完成
  - 若 guidePayload 返回 PAYLOAD_NOT_FOUND（组件不存在），同一 key 禁止再次 guide 重试；必须先 queryPayloads 选择可用替代组件
  - 若 node-tree 的 listChildren/getNode 报“节点不存在”，禁止据此宣称 rule.json 为空；必须先用 listChildren(parentComponentId:null) 或 countNodes/getAllData 做根级核验
  - 只有在 countNodes=1 且 listChildren(parentComponentId:null) 返回 0 个子节点时，才可认定 rule.json 为空；否则禁止输出“无页面结构/空页面”结论

  按目标文件选择动作：
  - 修改 rule.json：使用 node-tree action；先对计划写入的每个目录组件 type 调用 payload-catalog.guidePayload，再一次 addNodes 写入完整子树，node-tree 会自动按 type 提取指南并校验 props；只有未知 type 或参数校验失败时才 queryPayloads({ keyword: '...' }) / guidePayload({ key: type }) 选择替代或修正；调整已有节点位置优先用 moveNode，禁止用 removeNode + addNode 重建整段子树
    ⚠ props 更新规则：
      • setProps / setPropsBatch 默认使用 merge:true 或省略 merge
      • merge:false 会整体替换目标节点 props；只有在完整带回原 props（尤其 dataViewKey/contextDataMember/field/optionDataViewKey 等绑定）时才允许使用
      • 给 r-form 增加按钮、toolbar、样式时不得覆盖既有 dataViewKey；优先将按钮作为子节点追加，或使用 merge:true 写入新增 props
    ⚠ componentId 规则（违反则工具返回 null，造成死循环）：
      • componentId / parentComponentId 必须是节点的真实 id 值
        （即 listChildren 返回 SparkNode 中的顶层 id 字段）
      • 绝对禁止将组件类型名（r-table / r-tabs / r-text / r-select / r-date 等）当作 componentId 传入
      • 若不知道目标节点 id，按优先级选择：
        ① 优先调用 findByType({ type: 'r-tabs' }) 按类型一步拿到真实 id
        ② 或调用 listChildren({parentComponentId:null}) 逐层遍历，
           从每个节点的顶层 id 字段读取真实 id，再调用 getNode / setProps / moveNode / removeNode
    ⚠ 节点 id 规则：
      • addNode / addNodes / replaceNode / replaceNodes 写入的每个 SparkNode 必须包含顶层 id
      • id 使用稳定业务语义，如 leave-summary-section、leave-application-form、field-leave-type、pending-leave-table
      • 工具返回节点缺少 id 时，不要猜 r-section__0_0_0；改为重新写入带 id 的节点或读取真实节点
    ⚠ DataViewKey详细约束（rule 编辑必须遵守）：
      • 所有 DataView 定位只写 dataViewKey：table@viewId、#scope@table@viewId；严禁省略 viewId
      • DataView 输出读取必须拆成 dataViewKey + dataMember + dataField；dataMember 只允许枚举字符串 rows / columns / currentRow / selectedRows / aggregateResult / selectionAggregateResult / total / page / pageSize / requestState / mutating / loadingError / mutatingError
      • dataField 只用于对象型成员 currentRow / aggregateResult / selectionAggregateResult，允许点路径，如 dataViewKey: "stats@default", dataMember: "currentRow", dataField: "totalUsers"
      • rows / selectedRows 这类集合成员不能追加字段路径
      • r-table / r-list / r-tree / r-filter 用 dataViewKey 定位 DataView，通常不需要 dataMember
      • r-form / r-detail 用 dataViewKey 定位 DataView，用 contextDataMember 和 contextDataField 选择上下文值；表单页必须显式写 contextDataMember: "currentRow"，不要只写 dataMember
      • 展示组件、字段候选项、toolbar/action 的上下文值读取使用 dataViewKey + dataMember + dataField；字段列和表单字段通常在容器上下文中使用 field
      • 数据容器提供 DATA_ROW 后，任意组件的任意 prop 都可以用 $[fieldName] 读取当前行字段；例如 r-text.placeholder="$[applicantName]"、r-button.label="提交 $[status] 申请"
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

class PageDesignRootModuleKind extends ModuleKind {
  public constructor() {
    super({
      kind: PAGE_DESIGN_ROOT_KIND,
      name: 'Page Design',
      description: '单页面四文件编辑根模块，子模块负责 lifecycle、文本模型、组件荷载、节点树和数据集。',
      children: PAGE_DESIGN_CHILD_MODULES.map((item) => item.kind),
      list: (ctx, childKind) => ModuleOperationResult.ok(childModuleRefs(ctx, childKind)),
      find: (ctx, childKind) => {
        if (childKind === PAGE_DESIGN_ROOT_KIND && ctx.segments.length === 0) {
          const ref = createCurrentPageDesignRef(ctx)
          return ModuleOperationResult.ok(ref === null ? [] : [ref])
        }
        return ModuleOperationResult.ok(childModuleRefs(ctx, childKind))
      },
    })
  }
}

function createCurrentPageDesignRef(ctx: ModulePathContext): ModuleInstanceRef | null {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return null
  return {
    id: pageId,
    label: '当前页面设计业务',
    summary: 'PageDesign 根模块实例。',
  }
}

function childModuleRefs(ctx: ModulePathContext, childKind?: string): readonly ModuleInstanceRef[] {
  const pageId = pageDesignPageId(ctx)
  if (pageId === null) return []
  return PAGE_DESIGN_CHILD_MODULES
    .filter((item) => childKind === undefined || item.kind === childKind)
    .map((item) => ({
      id: pageId,
      label: item.label,
      summary: `${item.kind}: ${item.summary}`,
    }))
}

function pageDesignPageId(ctx: ModulePathContext): string | null {
  const pageId = ctx.host?.moduleInstanceId ?? ctx.segment.id
  return pageId.length === 0 ? null : pageId
}

function toServiceContext(ctx: ModulePathContext | AiHostBusinessRuntimeContext): PageDesignServiceContext {
  if ('host' in ctx || 'segment' in ctx) {
    const pathCtx = ctx
    return {
      requestId: pathCtx.host?.instanceId ?? pathCtx.segment.id,
      pageId: pathCtx.host?.moduleInstanceId ?? pathCtx.segment.id,
    }
  }
  return {
    requestId: ctx.instanceId,
    pageId: ctx.moduleInstanceId,
  }
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

export type RegisterPageDesignBusinessOptions = {
  readonly registry: AiHostBusinessRegistry
  readonly getPageDesignEditHost: (context: AiHostBusinessRuntimeContext) => PageDesignEditHost
}

export function registerPageDesignBusiness(options: RegisterPageDesignBusinessOptions): void {
  options.registry.register(createPageDesignBusinessRegistration({
    getEditToolHost: (context) => options.getPageDesignEditHost(context),
  }))
}

export function registerAssistantBusinesses(options: RegisterAssistantBusinessesOptions): void {
  options.registry.register(createLeaveRequestBusinessRegistration())

  if (options.getPageDesignEditHost === undefined) return

  registerPageDesignBusiness({
    registry: options.registry,
    getPageDesignEditHost: options.getPageDesignEditHost,
  })
}
