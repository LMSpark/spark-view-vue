/**
 * ═══════════════════════════════════════════════════════════════
 * modules/internal/function-invoker.ts — 业务函数调用器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 内部的函数调用调度器。负责将标准 function calling
 *   请求路由到目标 AiModule：先通过 Navigator 定位目标模块，再委托其
 *   invokeFunction 执行。
 *
 * 【核心类】
 *   FunctionInvoker — 函数调用器
 *     └─ invoke(request) → 导航到目标路径 → 校验 kindPath 一致性 → 调用 module.invokeFunction()
 *
 * 【数据流】
 *   1. ProtocolToolRouter 解析 direct function 或 module_call 兼容参数
 *   2. 构造 AiModuleFunctionInvokeRequest { path, kindPath, functionName, args, host }
 *   3. FunctionInvoker.invoke(request) → navigator.navigate(path, host)
 *   4. 校验 kindPath 一致性（防止 LLM 把函数用在错误的模块上）
 *   5. 委托 moduleKind.invokeFunction(ctx, functionName, args)
 *
 * 【消费方】ProtocolToolRouter（direct function 优先，module_call 兼容）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonValue } from '../../json'
import type { AiModuleFunctionInvokeRequest, AiModuleResult } from '../protocol'
import type { Navigator } from './navigator'
import { isNavigationSuccess } from './navigator'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · FunctionInvoker 类
// ═══════════════════════════════════════════════════════════════

/**
 * 业务函数调用器。
 *
 * 核心职责：导航到目标模块 → 校验 kindPath 一致 → 委托执行。
 * kindPath 一致性校验确保 LLM 不会将一个模块声明的函数用于另一个不相关的模块路径。
 */
export class FunctionInvoker {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  /** 执行函数调用请求 */
  public async invoke(request: AiModuleFunctionInvokeRequest): Promise<AiModuleResult<AiJsonValue>> {
    const { path, kindPath, functionName, args, host } = request
    // 步骤 1：导航到目标模块
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }

    // 步骤 2：校验 kindPath 一致性（函数声明的 kind 链必须与实际路径匹配）
    const actualKindPath = navResult.segmentCtx.segments.map((segment) => segment.kind)
    if (!sameTextList(actualKindPath, kindPath)) {
      return functionPathMismatch(kindPath, actualKindPath, functionName)
    }

    // 步骤 3：委托目标模块执行函数
    return navResult.moduleKind.invokeFunction(navResult.segmentCtx, functionName, args)
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 内部辅助函数
// ═══════════════════════════════════════════════════════════════

/** 浅比较两个字符串列表是否完全一致（长度 + 逐项 ===） */
function sameTextList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/** 函数路径不匹配错误：LLM 将函数用在了错误的模块路径上 */
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
