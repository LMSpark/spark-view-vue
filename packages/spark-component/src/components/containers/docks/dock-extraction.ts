/**
 * Dock 工具函数。
 *
 * 容器识别的 dock 类型集合已迁移到注册表 meta.docks（register-renderers.ts），
 * 此文件仅保留 dock 类型 → prop 名称的转换函数。
 */

/** dock 类型 → prop 名称（去掉 r- 前缀） */
export function dockTypeToPropName(dockType: string): string {
  return dockType.startsWith('r-') ? dockType.slice(2) : dockType
}
