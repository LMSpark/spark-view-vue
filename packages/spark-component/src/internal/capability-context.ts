import type { App } from 'vue'
import type { SparkCapabilityContext } from '../core/types.js'

/**
 * Spark 运行时上下文锚点表。
 *
 * SparkCapabilityContext 自己形成结构树；Vue 运行时只提供当前实例/appContext 入口，
 * 不再通过 provide/inject 传递父上下文。
 */

export interface SparkRuntimeOwner {
	parent?: SparkRuntimeOwner | null
	appContext?: unknown
}

const OWNER_CONTEXTS = new WeakMap<object, SparkCapabilityContext>()
const APP_ROOT_CONTEXTS = new WeakMap<object, SparkCapabilityContext>()

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null
}

function resolveInstalledAppContext(app: App): object | null {
	const appContext = (app as App & { _context?: unknown })._context
	return isObject(appContext) ? appContext : null
}

export function bindAppRootCapabilityContext(app: App, context: SparkCapabilityContext): void {
	const appContext = resolveInstalledAppContext(app)
	if (appContext === null) return
	APP_ROOT_CONTEXTS.set(appContext, context)
}

export function unbindAppRootCapabilityContext(app: App): void {
	const appContext = resolveInstalledAppContext(app)
	if (appContext === null) return
	APP_ROOT_CONTEXTS.delete(appContext)
}

export function bindCapabilityContextOwner(owner: object, context: SparkCapabilityContext): void {
	OWNER_CONTEXTS.set(owner, context)
}

export function unbindCapabilityContextOwner(owner: object): void {
	OWNER_CONTEXTS.delete(owner)
}

export function resolveParentCapabilityContext(
	owner: SparkRuntimeOwner | null,
	overrideParentContext?: SparkCapabilityContext,
): SparkCapabilityContext | null {
	if (overrideParentContext !== undefined) {
		return overrideParentContext
	}

	let currentOwner = owner?.parent ?? null
	while (currentOwner !== null) {
		const boundContext = OWNER_CONTEXTS.get(currentOwner as object)
		if (boundContext !== undefined) {
			return boundContext
		}
		currentOwner = currentOwner.parent ?? null
	}

	const appContext = owner?.appContext
	if (!isObject(appContext)) {
		return null
	}

	return APP_ROOT_CONTEXTS.get(appContext) ?? null
}