/**
 * Safe JavaScript execution sandbox for SPARK components
 * Provides controlled code execution with limited scope and error handling
 */

export interface SandboxOptions {
  /** Allowed global variables/functions */
  globals?: Record<string, unknown>
  /** Maximum execution time in milliseconds */
  timeout?: number
  /** Whether to allow async operations */
  allowAsync?: boolean
}

/**
 * Sandbox execution context
 */
export class Sandbox {
  private options: Required<SandboxOptions>

  constructor(options: SandboxOptions = {}) {
    this.options = {
      globals: options.globals ?? {},
      timeout: options.timeout ?? 5000,
      allowAsync: options.allowAsync ?? false
    }
  }

  /**
   * Execute JavaScript expression safely
   * @param expression JavaScript expression to evaluate
   * @param context Variables available in expression scope
   * @returns The result of the expression
   * @throws Error if execution fails or times out
   */
  run<T = unknown>(expression: string, context: Record<string, unknown> = {}): T {
    return this.executeExpressionSync(expression, context)
  }

  /**
   * Execute JavaScript expression asynchronously
   * @param expression JavaScript expression to evaluate
   * @param context Variables available in expression scope
   * @returns Promise resolving to the result
   */
  async runAsync<T = unknown>(expression: string, context: Record<string, unknown> = {}): Promise<T> {
    return this.executeExpressionAsync(expression, context)
  }

  /**
   * Render template string with interpolation
   * @param template Template string with {{variable}} or ${expression} syntax
   * @param context Variables for interpolation
   * @returns Rendered string
   */
  render(template: string, context: Record<string, unknown> = {}): string {
    const interpolated = this.interpolateTemplate(template)
    return this.run<string>(`\`${interpolated}\``, context)
  }

  /**
   * Render template asynchronously
   * @param template Template string
   * @param context Variables for interpolation
   * @returns Promise resolving to rendered string
   */
  async renderAsync(template: string, context: Record<string, unknown> = {}): Promise<string> {
    const interpolated = this.interpolateTemplate(template)
    return this.runAsync<string>(`\`${interpolated}\``, context)
  }

  /**
   * Check if code is safe to execute
   * @param code Code to validate
   * @returns True if code is safe
   * @throws Error with details if code is unsafe
   */
  validate(code: string): boolean {
    const issues = this.validateSafety(code)
    if (issues.length > 0) {
      throw new Error(`Unsafe code detected: ${issues.join(', ')}`)
    }
    return true
  }

  /**
   * Create a reusable expression evaluator
   * @param expression JavaScript expression
   * @returns Function that evaluates the expression with different contexts
   */
  createEvaluator<T = unknown>(expression: string) {
    this.validate(expression)
    return (context: Record<string, unknown> = {}) => this.run<T>(expression, context)
  }

  /**
   * Create a reusable template renderer
   * @param template Template string
   * @returns Function that renders the template with different contexts
   */
  createRenderer(template: string) {
    const interpolated = this.interpolateTemplate(template)
    this.validate(`\`${interpolated}\``)
    return (context: Record<string, unknown> = {}) => this.render(template, context)
  }

  private executeExpressionSync<T>(expression: string, context: Record<string, unknown>): T {
    this.validate(expression)

    const paramNames = Object.keys({ ...this.options.globals, ...context })
    const paramValues = Object.values({ ...this.options.globals, ...context })

    const func = new Function(...paramNames, `
      "use strict";
      return (${expression});
    `)

    return this.executeWithTimeoutSync(func, paramValues)
  }

  private async executeExpressionAsync<T>(expression: string, context: Record<string, unknown>): Promise<T> {
    this.validate(expression)

    const paramNames = Object.keys({ ...this.options.globals, ...context })
    const paramValues = Object.values({ ...this.options.globals, ...context })

    const func = new Function(...paramNames, `
      "use strict";
      return (${expression});
    `)

    return this.executeWithTimeoutAsync(func, paramValues)
  }

  private executeWithTimeoutSync<T>(func: Function, args: unknown[]): T {
    if (this.options.timeout <= 0) {
      return func(...args)
    }

    // Note: True timeout for sync execution is not possible in JavaScript
    // We can only warn about potential long execution
    const startTime = Date.now()

    try {
      const result = func(...args)

      const executionTime = Date.now() - startTime
      if (executionTime > this.options.timeout) {
        console.warn(`Sync execution took ${executionTime}ms, exceeding timeout of ${this.options.timeout}ms`)
      }

      if (result instanceof Promise) {
        throw new Error('Async operations not allowed in sync mode')
      }

      return result
    } catch (error) {
      throw error
    }
  }

  private async executeWithTimeoutAsync<T>(func: Function, args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${this.options.timeout}ms`))
      }, this.options.timeout)

      try {
        const result = func(...args)
        clearTimeout(timeoutId)

        if (result instanceof Promise) {
          result.then(resolve).catch(reject)
        } else {
          resolve(result)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        reject(error)
      }
    })
  }

  private interpolateTemplate(template: string): string {
    return template
      .replace(/\{\{(\w+)\}\}/g, '${$1}') // Convert {{var}} to ${var}
      .replace(/\$\{(\w+)\}/g, (match, _varName) => {
        // Allow simple expressions like ${value || 'default'}
        return match
      })
  }

  private validateSafety(code: string): string[] {
    const issues: string[] = []

    // Dangerous patterns
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
        issues.push(`unsafe pattern: ${pattern.source}`)
      }
    }

    // Infinite loops
    if (/\bwhile\s*\(\s*true\s*\)/.test(code) || /\bfor\s*\(\s*;;\s*\)/.test(code)) {
      issues.push('potential infinite loop')
    }

    return issues
  }
}

/**
 * Create a new sandbox instance
 * @param options Sandbox configuration
 * @returns Configured sandbox instance
 */
export function createSandbox(options?: SandboxOptions): Sandbox {
  return new Sandbox(options)
}

/**
 * Execute expression in default sandbox
 * @param expression JavaScript expression
 * @param context Variables for expression
 * @returns Result of expression
 */
export function run<T = unknown>(expression: string, context?: Record<string, unknown>): T {
  return defaultSandbox.run<T>(expression, context)
}

/**
 * Execute expression asynchronously in default sandbox
 * @param expression JavaScript expression
 * @param context Variables for expression
 * @returns Promise resolving to result
 */
export function runAsync<T = unknown>(expression: string, context?: Record<string, unknown>): Promise<T> {
  return defaultSandbox.runAsync<T>(expression, context)
}

/**
 * Render template in default sandbox
 * @param template Template string
 * @param context Variables for interpolation
 * @returns Rendered string
 */
export function render(template: string, context?: Record<string, unknown>): string {
  return defaultSandbox.render(template, context)
}

/**
 * Render template asynchronously in default sandbox
 * @param template Template string
 * @param context Variables for interpolation
 * @returns Promise resolving to rendered string
 */
export function renderAsync(template: string, context?: Record<string, unknown>): Promise<string> {
  return defaultSandbox.renderAsync(template, context)
}

/**
 * Validate code safety
 * @param code Code to validate
 * @returns True if safe
 * @throws Error if unsafe
 */
export function validate(code: string): boolean {
  return defaultSandbox.validate(code)
}

// Default sandbox instance
const defaultSandbox = new Sandbox()