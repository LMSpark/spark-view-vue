/**
 * Safe JavaScript execution sandbox for SPARK components
 * Provides controlled code execution with limited scope and error handling
 */
export interface SandboxOptions {
    /** Allowed global variables/functions */
    globals?: Record<string, unknown>;
    /** Maximum execution time in milliseconds */
    timeout?: number;
    /** Whether to allow async operations */
    allowAsync?: boolean;
}
/**
 * Sandbox execution context
 */
export declare class Sandbox {
    private options;
    constructor(options?: SandboxOptions);
    /**
     * Execute JavaScript expression safely
     * @param expression JavaScript expression to evaluate
     * @param context Variables available in expression scope
     * @returns The result of the expression
     * @throws Error if execution fails or times out
     */
    run<T = unknown>(expression: string, context?: Record<string, unknown>): T;
    /**
     * Execute JavaScript expression asynchronously
     * @param expression JavaScript expression to evaluate
     * @param context Variables available in expression scope
     * @returns Promise resolving to the result
     */
    runAsync<T = unknown>(expression: string, context?: Record<string, unknown>): Promise<T>;
    /**
     * Render template string with interpolation
     * @param template Template string with {{variable}} or ${expression} syntax
     * @param context Variables for interpolation
     * @returns Rendered string
     */
    render(template: string, context?: Record<string, unknown>): string;
    /**
     * Render template asynchronously
     * @param template Template string
     * @param context Variables for interpolation
     * @returns Promise resolving to rendered string
     */
    renderAsync(template: string, context?: Record<string, unknown>): Promise<string>;
    /**
     * Check if code is safe to execute
     * @param code Code to validate
     * @returns True if code is safe
     * @throws Error with details if code is unsafe
     */
    validate(code: string): boolean;
    /**
     * Create a reusable expression evaluator
     * @param expression JavaScript expression
     * @returns Function that evaluates the expression with different contexts
     */
    createEvaluator<T = unknown>(expression: string): (context?: Record<string, unknown>) => T;
    /**
     * Create a reusable template renderer
     * @param template Template string
     * @returns Function that renders the template with different contexts
     */
    createRenderer(template: string): (context?: Record<string, unknown>) => string;
    private executeExpressionSync;
    private executeExpressionAsync;
    private executeWithTimeoutSync;
    private executeWithTimeoutAsync;
    private interpolateTemplate;
    private validateSafety;
}
/**
 * Create a new sandbox instance
 * @param options Sandbox configuration
 * @returns Configured sandbox instance
 */
export declare function createSandbox(options?: SandboxOptions): Sandbox;
/**
 * Execute expression in default sandbox
 * @param expression JavaScript expression
 * @param context Variables for expression
 * @returns Result of expression
 */
export declare function run<T = unknown>(expression: string, context?: Record<string, unknown>): T;
/**
 * Execute expression asynchronously in default sandbox
 * @param expression JavaScript expression
 * @param context Variables for expression
 * @returns Promise resolving to result
 */
export declare function runAsync<T = unknown>(expression: string, context?: Record<string, unknown>): Promise<T>;
/**
 * Render template in default sandbox
 * @param template Template string
 * @param context Variables for interpolation
 * @returns Rendered string
 */
export declare function render(template: string, context?: Record<string, unknown>): string;
/**
 * Render template asynchronously in default sandbox
 * @param template Template string
 * @param context Variables for interpolation
 * @returns Promise resolving to rendered string
 */
export declare function renderAsync(template: string, context?: Record<string, unknown>): Promise<string>;
/**
 * Validate code safety
 * @param code Code to validate
 * @returns True if safe
 * @throws Error if unsafe
 */
export declare function validate(code: string): boolean;
//# sourceMappingURL=sandbox.d.ts.map