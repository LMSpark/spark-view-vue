/**
 * Safe JavaScript execution sandbox for SPARK components
 * Provides controlled code execution with limited scope and error handling
 */

export interface SandboxOptions {
  /** Allowed global variables/functions */
  globals?: Record<string, any>
  /** Maximum execution time in milliseconds */
  timeout?: number
  /** Whether to allow async operations */
  allowAsync?: boolean
}

export interface SandboxResult<T = any> {
  success: boolean
  result?: T
  error?: Error
  executionTime: number
}

/**
 * Safe JavaScript expression evaluator
 * Uses Function constructor instead of eval for better security
 */
export function evaluateExpression<T = any>(
  expression: string,
  context: Record<string, any> = {},
  options: SandboxOptions = {}
): SandboxResult<T> {
  const startTime = Date.now()

  try {
    // Create parameter names and values
    const paramNames = Object.keys(context)
    const paramValues = Object.values(context)

    // Create the function with limited scope
    const func = new Function(...paramNames, `
      "use strict";
      try {
        return (${expression});
      } catch (e) {
        throw new Error('Expression evaluation failed: ' + e.message);
      }
    `)

    // Execute with timeout protection
    let result: T
    if (options.timeout && options.timeout > 0) {
      result = executeWithTimeout(func, paramValues, options.timeout)
    } else {
      result = func(...paramValues)
    }

    return {
      success: true,
      result,
      executionTime: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      executionTime: Date.now() - startTime
    }
  }
}

/**
 * Execute function with timeout
 */
function executeWithTimeout<T>(
  func: Function,
  args: any[],
  timeout: number
): T {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Execution timeout after ${timeout}ms`))
    }, timeout)

    try {
      const result = func(...args)
      clearTimeout(timer)

      // Handle promises
      if (result instanceof Promise) {
        result.then(resolve).catch(reject)
      } else {
        resolve(result)
      }
    } catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  }) as any
}

/**
 * Safe template renderer with enhanced interpolation
 */
export function createSafeTemplateRenderer(template: string, options: SandboxOptions = {}) {
  // Support multiple interpolation syntaxes
  const interpolated = template
    .replace(/\{\{(\w+)\}\}/g, '${$1}') // Convert {{var}} to ${var}
    .replace(/\$\{(\w+)\}/g, (match, varName) => {
      // Allow simple expressions like ${value || 'default'}
      return match
    })

  return (data: Record<string, any>) => {
    return evaluateExpression<string>(
      `\`${interpolated}\``,
      data,
      { timeout: 100, ...options } // Short timeout for template rendering
    )
  }
}

/**
 * Validate JavaScript code for safety (basic checks)
 */
export function validateCodeSafety(code: string): { safe: boolean; warnings: string[] } {
  const warnings: string[] = []

  // Check for dangerous patterns
  const dangerousPatterns = [
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bsetTimeout\s*\(/,
    /\bsetInterval\s*\(/,
    /\bclearTimeout\s*\(/,
    /\bclearInterval\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bfetch\s*\(/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bwindow\b/,
    /\bglobalThis\b/,
    /\bprocess\b/,
    /\brequire\s*\(/,
    /\bimport\s*\(/,
    /\b__dirname\b/,
    /\b__filename\b/
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      warnings.push(`Potentially unsafe code pattern detected: ${pattern.source}`)
    }
  }

  // Check for infinite loops (basic detection)
  if (/\bwhile\s*\(\s*true\s*\)/.test(code) || /\bfor\s*\(\s*;;\s*\)/.test(code)) {
    warnings.push('Potential infinite loop detected')
  }

  return {
    safe: warnings.length === 0,
    warnings
  }
}