/**
 * ═══════════════════════════════════════════════════════════════
 * modules/runtime/ai-module-runtime.ts — 模块语义运行时组合根
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的 top-level 入口。组合所有内部组件
 *   （Registry / Navigator / AttributeAccessor / FunctionInvoker /
 *   ProtocolToolGenerator / ProtocolToolRouter / KnowledgeProjector），
 *   对外暴露 getTools() 和 executeTool() 两个核心能力。
 *
 * 【内部组件组合】
 *   AiModuleRegistry          — kind 注册表（启动期注册，运行期只读）
 *   Navigator                 — 路径导航 + 发现工具（listChildren/findInstance/describeKind）
 *   AttributeAccessor         — 属性读写（get/set）
 *   FunctionInvoker           — 函数调用（invokeFunction + kindPath 校验）
 *   ProtocolToolGenerator     — 固定 module_* tools 规约生成
 *   ProtocolToolRouter        — 工具调用路由（toolName → 具体操作）
 *   AiModuleKnowledgeProjector — 知识投影（project/queryModules/queryFunctions/guideAttribute/guideFunction）
 *
 * 【对外 API 两组】
 *   LLM 工具接口：
 *     · getTools()      — 返回 OpenAI function tool 规约（由 Host 层转发）
 *     · executeTool()   — 执行 tool_call（由 Host 层 tool-call-executor 调用）
 *   编程式直接访问（跳过工具路由）：
 *     · getAttribute / setAttribute / invokeFunction
 *     · listChildren / findInstance / describeKind
 *     · projectKnowledge / queryKnowledgeModules / queryKnowledgeFunctions / guideKnowledgeAttribute / guideKnowledgeFunction
 *
 * 【设计原则】不持有业务状态，只做协议层编排和路由。业务状态由
 *   业务服务或构造期注入的函数 runner 承载。
 *
 * 【消费方】ai-host.ts（注册 + 工具调用）、business-session.ts（工具转发）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonValue } from '../../json'
import { FunctionInvoker } from '../internal/function-invoker'
import { AttributeAccessor } from '../internal/attribute-accessor'
import { AiModuleRegistry } from '../internal/ai-module-registry'
import { Navigator, type AiModuleDescription } from '../internal/navigator'
import {
  ProtocolToolGenerator,
  type AiModuleToolSpec,
} from '../internal/protocol-tool-generator'
import {
  AiModuleKnowledgeProjector,
} from '../knowledge/ai-module-knowledge'
import type {
  AiModuleKnowledgeAttributeDetailGuide,
  AiModuleKnowledgeAttributeGuideInput,
  AiModuleKnowledgeFunctionFilter,
  AiModuleKnowledgeFunctionGuide,
  AiModuleKnowledgeFunctionGuideInput,
  AiModuleKnowledgeFunctionSummary,
  AiModuleKnowledgeModuleFilter,
  AiModuleKnowledgeModuleSummary,
  AiModuleKnowledgeSnapshot,
} from '../knowledge/knowledge-types'
import type {
  AiModuleFindInstanceRequest,
  AiModuleHostContext,
  AiModuleInstanceRef,
  AiModuleFunctionInvokeRequest,
  AiModule,
  AiModuleResult,
  AiModulePath,
  AiModuleSetAttributeRequest,
} from '../protocol'
import { ProtocolToolRouter } from './protocol-tool-router'
import type { AiModuleHandleToolDispatcher } from './protocol-tool-router'
import type { ProtocolToolArgs } from './protocol-tool-args'
import {
  inspectAiModuleRuntime,
  type AiModuleRuntimeInspectReport,
} from './runtime-inspector'

export type { ProtocolToolArgs } from './protocol-tool-args'

export type AiModuleRuntimeOptions = Readonly<{
  handleCallTool?: AiModuleToolSpec
  handleToolDispatcher?: AiModuleHandleToolDispatcher
}>

/* ── AiModuleRuntime ────────────────────────────────────────── */

export class AiModuleRuntime {
  private readonly kinds: AiModuleRegistry
  private readonly attributes: AttributeAccessor
  private readonly functions: FunctionInvoker
  private readonly navigator: Navigator
  private readonly toolGenerator: ProtocolToolGenerator
  private readonly toolRouter: ProtocolToolRouter
  private readonly knowledge: AiModuleKnowledgeProjector
  private handleToolSpec?: AiModuleToolSpec

  public constructor(options: AiModuleRuntimeOptions = {}) {
    this.kinds = new AiModuleRegistry()
    this.navigator = new Navigator(this.kinds)
    this.attributes = new AttributeAccessor(this.navigator)
    this.functions = new FunctionInvoker(this.navigator)
    this.knowledge = new AiModuleKnowledgeProjector(this.kinds)
    this.toolGenerator = new ProtocolToolGenerator(this.kinds)
    this.toolRouter = new ProtocolToolRouter({
      attributes: this.attributes,
      functions: this.functions,
      navigator: this.navigator,
      knowledge: this.knowledge,
      kinds: this.kinds,
      ...(options.handleToolDispatcher === undefined ? {} : {
        handleToolDispatcher: options.handleToolDispatcher,
      }),
    })
    if (options.handleCallTool !== undefined) {
      this.handleToolSpec = options.handleCallTool
    }
  }

  /* ── 注册 ──────────────────────────────────────────────── */

  /** 注册一个已构造 AiModule 实例（启动期操作，重复注册抛 AiModuleConflictError）。 */
  public register<TKind extends AiModule>(moduleKind: TKind): TKind {
    return this.kinds.register(moduleKind)
  }

  /** 检查当前 runtime 注册图的完整性，供启动日志、单测和接入诊断使用。 */
  public inspect(): AiModuleRuntimeInspectReport {
    return inspectAiModuleRuntime(this.kinds.list())
  }

  /* ── LLM 工具 ──────────────────────────────────────────── */

  /** 获取所有 LLM 可见的固定 module_* function tool 规约。 */
  public getTools(): readonly AiModuleToolSpec[] {
    const tools = this.toolGenerator.generate()
    return this.handleToolSpec === undefined ? tools : [...tools, this.handleToolSpec]
  }

  /** 执行 tool_call（Host 层 tool-call-executor 调用） */
  public async executeTool(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    return this.toolRouter.execute(toolName, rawArgs, host)
  }

  /* ── 直接访问（跳过工具路由，供业务方编程式调用）───────── */

  /** 直接读取属性 */
  public async getAttribute(
    path: AiModulePath,
    attrName: string,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
    return this.attributes.get(path, attrName, host)
  }

  /** 直接写入属性 */
  public async setAttribute(request: AiModuleSetAttributeRequest): Promise<AiModuleResult<void>> {
    return this.attributes.set(request)
  }

  /** 直接调用函数 */
  public async invokeFunction(
    request: AiModuleFunctionInvokeRequest,
  ): Promise<AiModuleResult<AiJsonValue>> {
    return this.functions.invoke(request)
  }

  /** 直接列出子实例 */
  public async listChildren(
    path: AiModulePath,
    childKind?: string,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<readonly AiModuleInstanceRef[]>> {
    return this.navigator.listChildren(path, childKind, host)
  }

  /** 直接查询子实例 */
  public async findInstance(
    request: AiModuleFindInstanceRequest,
  ): Promise<AiModuleResult<readonly AiModuleInstanceRef[]>> {
    return this.navigator.findInstance(request)
  }

  /** 直接查询 kind 元数据 */
  public describeKind(kind: string): AiModuleResult<AiModuleDescription> {
    return this.navigator.describeKind(kind)
  }

  /* ── 知识投影（编程式入口）────────────────────────── */

  /** 投影当前注册表为 LLM 可读的知识快照。 */
  public projectKnowledge(): AiModuleKnowledgeSnapshot {
    return this.knowledge.project()
  }

  /** 查询模块目录摘要。 */
  public queryKnowledgeModules(
    filter: AiModuleKnowledgeModuleFilter = {},
  ): readonly AiModuleKnowledgeModuleSummary[] {
    return this.knowledge.queryModules(filter)
  }

  /** 查询函数目录摘要。 */
  public queryKnowledgeFunctions(
    filter: AiModuleKnowledgeFunctionFilter = {},
  ): readonly AiModuleKnowledgeFunctionSummary[] {
    return this.knowledge.queryFunctions(filter)
  }

  /** 查询单个属性完整指南。 */
  public guideKnowledgeAttribute(
    input: AiModuleKnowledgeAttributeGuideInput,
  ): AiModuleResult<AiModuleKnowledgeAttributeDetailGuide> {
    return this.knowledge.guideAttribute(input)
  }

  /** 查询单个函数完整指南。 */
  public guideKnowledgeFunction(
    input: AiModuleKnowledgeFunctionGuideInput,
  ): AiModuleResult<AiModuleKnowledgeFunctionGuide> {
    return this.knowledge.guideFunction(input)
  }
}
