import {
  bindLiveModelAdapter,
  createEditState,
  registerPageDesignEditFunctions,
  type EditState,
  type EditToolHost,
} from '../../packages/spark-ai/src/business/page-design'
import { clearFunctionRegistry } from '../../packages/spark-ai/src/core/function/registry'
import { clearKnowledgeRegistry } from '../../packages/spark-ai/src/core/knowledge/registry'
import { createFunctionRuntimeContext, type FunctionResult, type FunctionRuntimeContext } from '../../packages/spark-ai/src/core/function/contracts'
import { executeFunction } from '../../packages/spark-ai/src/core/function/dispatcher'

export interface PageDesignFunctionHarness {
  context: FunctionRuntimeContext
  editState: EditState
  exec: (action: string, params?: unknown, requestId?: string) => FunctionResult
}

export function createPageDesignFunctionHarness(host?: EditToolHost): PageDesignFunctionHarness {
  clearFunctionRegistry()
  clearKnowledgeRegistry()

  const editState = createEditState()
  if (host !== undefined) {
    bindLiveModelAdapter(editState, host)
  }
  registerPageDesignEditFunctions(editState)

  const context = createFunctionRuntimeContext()
  return {
    context,
    editState,
    exec: (action, params = {}, requestId = 'test-function') => executeFunction(action, params, context, requestId),
  }
}