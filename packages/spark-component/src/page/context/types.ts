/**
 * 渲染器类型定义 — 脚本沙箱上下文与组件访问 API（执行层）
 *
 * 页面渲染器 Props（编排层）已迁移至 SparkPageRenderer.vue <script> 块。
 */

import type { IDataSet, SparkData } from '@spark-view/spark-data'
import type { PageConfig, IPageRoute, IScriptContext } from '@spark-view/spark-page-config'
import type { PageComponentInstanceEntry } from '../../core/capability-keys.js'

// ── 基础重导出 ────────────────────────────────────────────────────────────

// PageConfig 来自 spark-page-config（数据配置层权威定义），本文件仅透出类型
export type { PageConfig }
// IPageRoute 重导出供渲染层实现层使用
export type { IPageRoute }

// ── 分区 C：脚本沙箱能力（页面运行时访问面） ─────────────────────────────────

/** 页面脚本组件访问 API（由渲染器根节点注入） */
export interface PageComponentAccessApi {
  /** 按组件 id 获取实例快照（只读元数据，不返回组件 API 对象） */
  get(id: string): PageComponentInstanceEntry | null
  /** 列出页面组件实例（可按 type 过滤，只读元数据） */
  list(type?: string): PageComponentInstanceEntry[]
  /** 按组件 id 获取组件暴露 API（用于脚本调用组件能力） */
  getApi<T = unknown>(id: string): T | null
  /** 按 type 获取同类组件 API 列表 */
  getApisByType<T = unknown>(type: string): T[]
}

/**
 * 页面脚本运行时上下文。
 *
 * 继承 `IScriptContext`（spark-page-config，框架无关契约），
 * 在此基础上添加 spark-component 层具体注入字段：
 * - `$dataSet` — DataSet 实例（具体类型）
 * - `$components` — 覆盖为更完整的 `PageComponentAccessApi`
 * - `SparkData` — 数据工具命名空间
 * - `h` — 渲染函数（Render* 专用）
 * - Timer API — 沙箱白名单
 */
export interface PageContext extends IScriptContext {
  /** 页面 DataSet（比 IScriptContext 额外注入的具体类型） */
  $dataSet: IDataSet | null
  /** 组件访问 API（覆盖 IScriptContext 基类，提供更丰富方法） */
  $components: PageComponentAccessApi
  /** SPARK 数据空间工具命名空间（createTreeManager 等，Render* 函数用） */
  SparkData: typeof SparkData
  /** 渲染函数（框架无关签名，运行时由渲染层注入，Render* 函数专用） */
  h: (type: unknown, ...args: unknown[]) => unknown

  // Timer API（沙箱白名单）
  setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearTimeout: (id?: number) => void
  setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
  clearInterval: (id?: number) => void
}

