/**
 * modules/internal/function-invoker.ts — 业务函数调用器
 *
 * LLM 层使用标准 function calling：函数名已经包含 kind path + functionName，
 * 参数只保留 { path, args }。本调用器负责把标准函数调用路由到目标 AiModule。
 */

import type { AiJsonValue } from '../../json'
import type { AiModuleFunctionInvokeRequest, AiModuleResult } from '../protocol'
import type { Navigator } from './navigator'
import { isNavigationSuccess } from './navigator'

export class FunctionInvoker {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  public async invoke(request: AiModuleFunctionInvokeRequest): Promise<AiModuleResult<AiJsonValue>> {
    const { path, kindPath, functionName, args, host } = request
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }

    const actualKindPath = navResult.segmentCtx.segments.map((segment) => segment.kind)
    if (!sameTextList(actualKindPath, kindPath)) {
      return functionPathMismatch(kindPath, actualKindPath, functionName)
    }

    return navResult.moduleKind.invokeFunction(navResult.segmentCtx, functionName, args)
  }
}

function sameTextList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function functionPathMismatch(
  expectedKindPath: readonly string[],
  actualKindPath: readonly string[],
  functionName: string,
): AiModuleResult<never> {
  return {
    ok: false,
    checks: [{
      level: 'error',
      code: 'FUNCTION_PATH_MISMATCH',
      message: `函数 ${expectedKindPath.join('.')}.${functionName} 不能用于路径 ${actualKindPath.join('.')}`,
      hint: '请使用与函数 kind path 匹配的实例 path。',
    }],
  }
}
