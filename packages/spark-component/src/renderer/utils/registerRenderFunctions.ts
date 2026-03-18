/**
 * Render* 函数注册工具
 *
 * 将脚本中的 Render* 函数包装为 Vue 组件并注册到 app.component()。
 * 被 SparkPageRenderer 调用。
 *
 * 策略：每个 Vue App 实例维护一张 name → ShallowRef<renderFn> 映射。
 * 首次遇到某名称时创建组件并调用 app.component()（只注册一次，消除重复注册 warn）。
 * 页面重新加载时只更新 ref.value，shallowRef 的响应性自动触发组件重渲染。
 */

import { shallowRef, defineComponent, markRaw, type App, type ShallowRef } from 'vue'

/** 每个 App 维护独立的 Render* 注册表，避免跨 App 污染 */
const _renderFnRegistry = new WeakMap<App, Map<string, ShallowRef<((props?: Record<string, unknown>) => unknown) | null>>>()

/**
 * 将 pageFunctions 中所有 `Render*` 函数注册为 Vue 全局组件
 *
 * @param app            Vue App 实例
 * @param pageFunctions  脚本沙箱编译后的函数表
 */
export function registerRenderFunctions(
  app: App,
  pageFunctions: Record<string, (...args: unknown[]) => unknown>,
): void {
  let fnMap = _renderFnRegistry.get(app)
  if (!fnMap) {
    fnMap = new Map()
    _renderFnRegistry.set(app, fnMap)
  }

  for (const [name, fn] of Object.entries(pageFunctions)) {
    if (!name.startsWith('Render') || typeof fn !== 'function') continue
    const camelName = name.charAt(0).toLowerCase() + name.slice(1)

    if (fnMap.has(name)) {
      // 已注册：只更新 ref，无需重新调用 app.component()
      const existingRef = fnMap.get(name)
      if (existingRef) existingRef.value = fn as (props?: Record<string, unknown>) => unknown
    } else {
      // 首次注册：创建 ref，包装组件，注册到 app
      const fnRef = shallowRef<((props?: Record<string, unknown>) => unknown) | null>(fn as (props?: Record<string, unknown>) => unknown)
      fnMap.set(name, fnRef)
      fnMap.set(camelName, fnRef) // 大驼峰与小驼峰共享同一个 ref

      const comp = markRaw(defineComponent({
        name,
        // render fn 通过 fnRef 间接调用：
        //   - fnRef.value 变化（页面重载）→ shallowRef 响应性触发重渲染
        //   - 运行时 props / attrs 透传给脚本函数，支持 RenderActions(props) 这类用法
        //   - fnRef.value(...) 内部访问响应式数据 → reactive 依赖追踪正常工作
        setup: (_, { attrs }) => () => fnRef.value?.({ ...attrs }),
      }))
      app.component(name, comp)
      app.component(camelName, comp)
    }
  }
}
