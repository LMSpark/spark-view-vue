/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 语义运行时组合根                                           │
 * │  ModuleSemanticRuntime — Composition Root                                     │
 * │                                                                              │
 * │  本模块是 module-semantic 层的 top-level 入口，组合所有内部组件：               │
 * │    · ModuleKindRegistry    — kind 注册表（启动期注册，运行期只读）             │
 * │    · Navigator             — 路径导航 + 发现工具（listChildren/findInstance）   │
 * │    · AttributeAccessor     — 属性读写（getAttribute/setAttribute）            │
 * │    · ActionInvoker         — 动作调用（invokeAction + 参数校验）               │
 * │    · ProtocolToolGenerator — 知识工具 + 执行协议工具规约生成（LLM 可见）      │
 * │    · ProtocolToolRouter    — 工具调用路由（toolName → 具体操作）               │
 * │                                                                              │
 * │  对外暴露两个核心能力：                                                        │
 * │    · getLlmTools()     — 返回固定协议工具规约（由 Host 层转发给 AI 后端）      │
 * │    · executeTool()     — 执行协议工具调用（由 Host 层 tool-call-executor 调用）│
 * │                                                                              │
 * │  设计原则：不持有业务状态，只做协议层编排和路由。                                │
 * │  业务状态由业务服务或构造期 action 委托承载。                                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonValue } from '../../schema'
import { ActionInvoker } from '../internal/action-invoker'
import { AttributeAccessor } from '../internal/attribute-accessor'
import { ModuleKindRegistry } from '../internal/module-kind-registry'
import { Navigator, type ModuleKindDescription } from '../internal/navigator'
import {
  ProtocolToolGenerator,
  type ModuleSemanticToolSpec,
} from '../internal/protocol-tool-generator'
import {
  ModuleSemanticKnowledgeProjector,
  type ModuleSemanticKnowledgeFunctionFilter,
  type ModuleSemanticKnowledgeFunctionGuide,
  type ModuleSemanticKnowledgeFunctionGuideInput,
  type ModuleSemanticKnowledgeFunctionSummary,
  type ModuleSemanticKnowledgeModuleFilter,
  type ModuleSemanticKnowledgeModuleSummary,
  type ModuleSemanticKnowledgeSnapshot,
} from '../knowledge/module-semantic-knowledge'
import type {
  ModuleHostContext,
  ModuleInstanceRef,
  ModuleKind,
  ModuleOperationResult,
  ModulePath,
} from '../protocol'
import type {
  ModuleFindInstanceRequest,
  ModuleInvokeActionRequest,
  ModuleSetAttributeRequest,
} from '../protocol/module-context'
import { ProtocolToolRouter } from './protocol-tool-router'
import type { ProtocolToolArgs } from './protocol-tool-args'

export type { ProtocolToolArgs } from './protocol-tool-args'

/* -------------------------------------------------------------------------------
 * 一、ModuleSemanticRuntime
 * ----------------------------------------------------------------------------- */

export class ModuleSemanticRuntime {
  private readonly kinds: ModuleKindRegistry
  private readonly attributes: AttributeAccessor
  private readonly actions: ActionInvoker
  private readonly navigator: Navigator
  private readonly toolGenerator: ProtocolToolGenerator
  private readonly toolRouter: ProtocolToolRouter
  private readonly knowledge: ModuleSemanticKnowledgeProjector

  public constructor() {
    this.kinds = new ModuleKindRegistry()
    this.navigator = new Navigator(this.kinds)
    this.attributes = new AttributeAccessor(this.navigator)
    this.actions = new ActionInvoker(this.navigator)
    this.knowledge = new ModuleSemanticKnowledgeProjector(this.kinds)
    this.toolGenerator = new ProtocolToolGenerator(this.kinds)
    this.toolRouter = new ProtocolToolRouter(this.attributes, this.actions, this.navigator, this.knowledge)
  }

  /* ── 注册 ──────────────────────────────────────────────── */

  /** 注册一个 ModuleKind（启动期操作，重复注册抛 ModuleKindConflictError） */
  public registerKind(moduleKind: ModuleKind): void {
    this.kinds.register(moduleKind)
  }

  /* ── LLM 工具 ──────────────────────────────────────────── */

  /** 获取所有 LLM 可见的协议工具规约（固定知识工具 + 执行协议工具） */
  public getLlmTools(): readonly ModuleSemanticToolSpec[] {
    return this.toolGenerator.generate()
  }

  /** 执行协议工具调用（Host 层 tool-call-executor 调用） */
  public async executeTool(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.toolRouter.execute(toolName, rawArgs, host)
  }

  /* ── 直接访问（跳过工具路由，供业务方编程式调用）───────── */

  /** 直接读取属性 */
  public async getAttribute(
    path: ModulePath,
    attrName: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.attributes.get(path, attrName, host)
  }

  /** 直接写入属性 */
  public async setAttribute(request: ModuleSetAttributeRequest): Promise<ModuleOperationResult<void>> {
    return this.attributes.set(request)
  }

  /** 直接调用动作 */
  public async invokeAction(
    request: ModuleInvokeActionRequest,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.actions.invoke(request)
  }

  /** 直接列出子实例 */
  public async listChildren(
    path: ModulePath,
    childKind?: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return this.navigator.listChildren(path, childKind, host)
  }

  /** 直接查询子实例 */
  public async findInstance(
    request: ModuleFindInstanceRequest,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return this.navigator.findInstance(request)
  }

  /** 直接查询 kind 元数据 */
  public describeKind(kind: string): ModuleOperationResult<ModuleKindDescription> {
    return this.navigator.describeKind(kind)
  }

  /* ── 知识投影（旧 knowledge 体系的编程式入口）──────── */

  /** 投影当前注册表为 LLM 可读的知识快照。 */
  public projectKnowledge(): ModuleSemanticKnowledgeSnapshot {
    return this.knowledge.project()
  }

  /** 查询模块目录摘要，等价于旧 knowledge.queryModules 的当前协议映射。 */
  public queryKnowledgeModules(
    filter: ModuleSemanticKnowledgeModuleFilter = {},
  ): readonly ModuleSemanticKnowledgeModuleSummary[] {
    return this.knowledge.queryModules(filter)
  }

  /** 查询函数目录摘要，等价于旧 knowledge.queryFunctions 的当前协议映射。 */
  public queryKnowledgeFunctions(
    filter: ModuleSemanticKnowledgeFunctionFilter = {},
  ): readonly ModuleSemanticKnowledgeFunctionSummary[] {
    return this.knowledge.queryFunctions(filter)
  }

  /** 查询单个函数完整指南，等价于旧 knowledge.guideFunction 的当前协议映射。 */
  public guideKnowledgeFunction(
    input: ModuleSemanticKnowledgeFunctionGuideInput,
  ): ModuleOperationResult<ModuleSemanticKnowledgeFunctionGuide> {
    return this.knowledge.guideFunction(input)
  }
}
