/**
 * spark-component 内部基础设施入口。
 *
 * 仅导出 capability-context 锚点操作（WeakMap 绑定/解绑/查找），
 * 组件层消费通过 `components/internal.ts` 桥接 core 层符号。
 */

export {
	bindAppRootCapabilityContext,
	unbindAppRootCapabilityContext,
	bindCapabilityContextOwner,
	unbindCapabilityContextOwner,
	resolveParentCapabilityContext,
} from './capability-context.js'