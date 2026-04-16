/**
 * 页面级权限模式能力键 — 页面权限模型的唯一定义
 *
 * 由 PageRenderer 从路由 meta.permissionMode 读取后 sparkProvide；
 * 权限模块内部通过 sparkConsume 获取当前页面的权限控制模式。
 * - 'none'：不控制，跳过所有权限检查
 * - 'masked'：权限数据正常应用，字段可见性下限为 Masked
 * - 'invisible'：后端控制导航可见性，前端权限检查正常执行
 *
 * ⚠️ 此能力键仅由 permission 模块导出，外部不应直接 import。
 * 渲染器提供方（SparkPageRenderer）从本文件导入以 sparkProvide。
 */
import type { NavPermissionMode } from '@spark-view/spark-utils'
import { defineCapability } from '../core/capability-system.js'

export const PAGE_PERMISSION_MODE = defineCapability<NavPermissionMode>('spark:capability:permission-mode')
