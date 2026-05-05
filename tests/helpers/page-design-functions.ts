import {
  bindLiveModelAdapter,
  clearFunctionRegistry,
  clearKnowledgeRegistry,
  createEditState,
  createFunctionRuntimeContext,
  executeFunction,
  registerPageDesignEditFunctions,
  type EditState,
  type EditToolHost,
  type FunctionResult,
  type FunctionRuntimeContext,
} from '@spark-view/spark-ai'

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