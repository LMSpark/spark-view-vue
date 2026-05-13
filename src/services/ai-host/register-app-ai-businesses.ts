import {
  LEAVE_REQUEST_MODULE_ID,
  LeaveRequestModule,
  PAGE_DESIGN_MODULE_ID,
  PageDesignModule,
  createLeaveDraftId,
  type AiModuleRegistrationData,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeHistoryEntry,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeStartInstanceResult,
} from '@spark-view/spark-ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'
import type { AppAiBusinessRegistry } from './business-registry'
import type {
  AppAiBusinessAppendMessageOptions,
  AppAiBusinessExecuteFunctionCallOptions,
  AppAiBusinessResolveInput,
  AppAiBusinessRuntime,
  AppAiBusinessRuntimeContext,
} from './types'

export interface RegisterAppAiBusinessesOptions {
  readonly registry: AppAiBusinessRegistry
  readonly resolveLeaveDraftId?: (input: AppAiBusinessResolveInput) => string
  readonly getPageDesignEditHost?: (input: AppAiBusinessRuntimeContext) => PageDesignEditHost
  readonly resolvePageDesignInstanceId?: (input: AppAiBusinessResolveInput) => string | null
}

class LeaveRequestBusinessRuntime implements AppAiBusinessRuntime {
  readonly moduleId = LEAVE_REQUEST_MODULE_ID

  constructor(
    private readonly module: LeaveRequestModule,
    private readonly resolveInstanceId: (input: AppAiBusinessResolveInput) => string,
  ) {}

  getRegistrationData(): AiModuleRegistrationData {
    return this.module.getRegistrationData()
  }

  resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
    return this.resolveInstanceId(input)
  }

  startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartInstanceResult> {
    return this.module.startSession({ ...context, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.module.appendMessage({ ...options, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.module.executeFunctionCall({ ...options, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return this.module.getSessionHistory({ ...context, moduleId: LEAVE_REQUEST_MODULE_ID })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.module.releaseModuleInstance(moduleInstanceId)
  }
}

class PageDesignBusinessRuntime implements AppAiBusinessRuntime {
  readonly moduleId = PAGE_DESIGN_MODULE_ID

  constructor(
    private readonly module: PageDesignModule,
    private readonly resolveInstanceId: (input: AppAiBusinessResolveInput) => string | null,
  ) {}

  getRegistrationData(): AiModuleRegistrationData {
    return this.module.getRegistrationData()
  }

  resolveBusinessInstance(input: AppAiBusinessResolveInput): string {
    const pageId = this.resolveInstanceId(input)
    if (pageId === null || pageId.trim() === '') {
      throw new Error('PageDesign business requires an active pageId')
    }
    return pageId
  }

  async startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartInstanceResult> {
    return this.module.startSession({ ...context, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.module.appendMessage({ ...options, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.module.executeFunctionCall({
      ...options,
      moduleId: PAGE_DESIGN_MODULE_ID,
      projection: options.projection,
    })
  }

  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[] {
    return this.module.getSessionHistory({ ...context, moduleId: PAGE_DESIGN_MODULE_ID })
  }

  releaseModuleInstance(moduleInstanceId: string): void {
    this.module.releaseModuleInstance(moduleInstanceId)
  }
}

export function registerAppAiBusinesses(options: RegisterAppAiBusinessesOptions): void {
  const leaveModule = new LeaveRequestModule()
  options.registry.register(new LeaveRequestBusinessRuntime(
    leaveModule,
    options.resolveLeaveDraftId ?? (() => createLeaveDraftId()),
  ))

  if (options.getPageDesignEditHost === undefined) return

  const pageDesignModule = new PageDesignModule({
    getEditToolHost: (context) => options.getPageDesignEditHost?.(context) ?? missingPageDesignEditHost(),
  })
  options.registry.register(new PageDesignBusinessRuntime(
    pageDesignModule,
    options.resolvePageDesignInstanceId ?? ((input) => input.context.pageId ?? null),
  ))
}

function missingPageDesignEditHost(): never {
  throw new Error('PageDesign edit host is not registered')
}