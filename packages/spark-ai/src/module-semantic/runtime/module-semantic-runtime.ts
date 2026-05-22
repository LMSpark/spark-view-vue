/**
 * module-semantic/runtime/module-semantic-runtime.ts
 *
 * ModuleSemanticRuntime is the composition root for module-semantic. It wires
 * registry, navigation, attributes, actions, tool generation, and tool routing
 * without owning business state.
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
import type {
  ModuleHostContext,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKind,
  ModuleOperationResult,
  ModulePath,
} from '../protocol'
import { ProtocolToolRouter } from './protocol-tool-router'
import type { ProtocolToolArgs } from './protocol-tool-args'

export type { ProtocolToolArgs } from './protocol-tool-args'

export class ModuleSemanticRuntime {
  private readonly kinds: ModuleKindRegistry
  private readonly attributes: AttributeAccessor
  private readonly actions: ActionInvoker
  private readonly navigator: Navigator
  private readonly toolGenerator: ProtocolToolGenerator
  private readonly toolRouter: ProtocolToolRouter

  public constructor() {
    this.kinds = new ModuleKindRegistry()
    this.navigator = new Navigator(this.kinds)
    this.attributes = new AttributeAccessor(this.navigator)
    this.actions = new ActionInvoker(this.navigator)
    this.toolGenerator = new ProtocolToolGenerator(this.kinds)
    this.toolRouter = new ProtocolToolRouter(this.attributes, this.actions, this.navigator)
  }

  public registerKind(moduleKind: ModuleKind): void {
    this.kinds.register(moduleKind)
  }

  public getLlmTools(): readonly ModuleSemanticToolSpec[] {
    return this.toolGenerator.generate()
  }

  public async executeTool(
    toolName: string,
    rawArgs: ProtocolToolArgs,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.toolRouter.execute(toolName, rawArgs, host)
  }

  public async getAttribute(
    path: ModulePath,
    attrName: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.attributes.get(path, attrName, host)
  }

  public async setAttribute(
    path: ModulePath,
    attrName: string,
    value: LlmJsonValue,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<void>> {
    return this.attributes.set(path, attrName, value, host)
  }

  public async invokeAction(
    path: ModulePath,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    return this.actions.invoke(path, actionName, args, host)
  }

  public async listChildren(
    path: ModulePath,
    childKind?: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return this.navigator.listChildren(path, childKind, host)
  }

  public async findInstance(
    path: ModulePath,
    childKind: string,
    query: ModuleInstanceQuery,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return this.navigator.findInstance(path, childKind, query, host)
  }

  public describeKind(kind: string): ModuleOperationResult<ModuleKindDescription> {
    return this.navigator.describeKind(kind)
  }
}
