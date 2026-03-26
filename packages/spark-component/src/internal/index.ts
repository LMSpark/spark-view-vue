/**
 * spark-component 内部便利入口。
 *
 * 仅供包内实现与重构期定位使用；
 * 公共消费方优先使用根入口 `src/index.ts`。
 */

export * as coreFiles from '../core/index.js'
export * as systemFiles from '../system/index.js'
export * as pageFiles from '../page/index.js'
export * as componentFiles from '../components/internal.js'
export { INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY } from './capability-context.js'