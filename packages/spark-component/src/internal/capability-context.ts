import type { SparkCapabilityContext } from '../core/types.js'

/**
 * Spark 运行时上下文锚点表。
 *
 * SparkCapabilityContext 自己形成结构树；
 * 运行时仅保留 owner 链与 pageRoot 锚点，
 * 不再通过 provide/inject 传递父上下文。
 */

export interface SparkRuntimeOwner {
	parent?: SparkRuntimeOwner | null
	pageRoot?: unknown
}

const OWNER_CONTEXTS = new WeakMap<object, SparkCapabilityContext>()
const PAGE_ROOT_CONTEXTS = new WeakMap<object, SparkCapabilityContext>()

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null
}

export function bindCapabilityContextOwner(owner: object, context: SparkCapabilityContext): void {
	OWNER_CONTEXTS.set(owner, context)
}

export function unbindCapabilityContextOwner(owner: object): void {
	OWNER_CONTEXTS.delete(owner)
}

export function resolveCapabilityContextOwner(owner: object): SparkCapabilityContext | null {
	return OWNER_CONTEXTS.get(owner) ?? null
}

export function bindPageRootCapabilityContext(pageRoot: object, context: SparkCapabilityContext): void {
	PAGE_ROOT_CONTEXTS.set(pageRoot, context)
}

export function unbindPageRootCapabilityContext(pageRoot: object): void {
	PAGE_ROOT_CONTEXTS.delete(pageRoot)
}

export function resolvePageRootCapabilityContext(pageRoot: unknown): SparkCapabilityContext | null {
	if (!isObject(pageRoot)) return null
	return PAGE_ROOT_CONTEXTS.get(pageRoot) ?? null
}

export function resolveParentCapabilityContext(
	owner: SparkRuntimeOwner | null,
	overrideHostContext?: SparkCapabilityContext,
): SparkCapabilityContext | null {
	if (overrideHostContext !== undefined) {
		return overrideHostContext
	}

	let currentOwner = owner?.parent ?? null
	while (currentOwner !== null) {
		const boundContext = OWNER_CONTEXTS.get(currentOwner as object)
		if (boundContext !== undefined) {
			return boundContext
		}
		currentOwner = currentOwner.parent ?? null
	}

	const pageRootContext = resolvePageRootCapabilityContext(owner?.pageRoot)
	if (pageRootContext !== null) {
		return pageRootContext
	}

	return null
}