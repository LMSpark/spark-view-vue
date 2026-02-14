/**
 * 字段渲染助手
 *
 * 结合字段配置和权限，计算字段的最终渲染状态
 */

import type { IDataRow } from '../types'
import { FieldVisibility } from '../types'
import type { PermissionChecker } from './PermissionChecker'

// ===== 类型定义 =====

/** 字段渲染配置 */
export interface IFieldRenderConfig {
  field: string
  visible?: boolean
  editable?: boolean
  maskRule?: (value: unknown) => string
  label?: string
  width?: number | string
}

/** 字段渲染状态 */
export interface IFieldRenderState {
  field: string
  visibility: FieldVisibility
  editable: boolean
  displayValue: string | undefined
  shouldRender: boolean
}

/** 字段渲染助手接口 */
export interface IFieldRenderHelper {
  computeFieldState(config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState
  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[]
  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[]
}

// ===== 实现类 =====

export class FieldRenderHelper implements IFieldRenderHelper {
  // ===== 字段状态计算 =====

  /**
   * 计算单个字段的渲染状态
   * @param config 字段配置
   * @param row 数据行
   * @param checker 权限检查器
   * @returns 字段渲染状态
   */
  computeFieldState(config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState {
    const { field } = config
    const visibility = checker.getFieldVisibility(field, row)
    const editable = checker.isFieldEditable(field, row) && (config.editable !== false)
    const shouldRender = visibility !== FieldVisibility.Hidden && (config.visible !== false)

    let displayValue: string | undefined
    if (shouldRender) {
      const value = row[field]
      displayValue = value !== undefined && value !== null ? String(value) : ''
    }

    return { field, visibility, editable, displayValue, shouldRender }
  }

  /**
   * 批量计算字段渲染状态
   * @param configs 字段配置数组
   * @param row 数据行
   * @param checker 权限检查器
   * @returns 字段渲染状态数组
   */
  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] {
    return configs.map(c => this.computeFieldState(c, row, checker))
  }

  /**
   * 过滤可见字段配置
   * @param configs 字段配置数组
   * @param row 数据行
   * @param checker 权限检查器
   * @returns 可见字段配置数组
   */
  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] {
    return configs.filter(c => this.computeFieldState(c, row, checker).shouldRender)
  }
}

// ===== 工厂函数 =====

let instance: IFieldRenderHelper | null = null

/**
 * 创建字段渲染助手实例
 * @returns 字段渲染助手实例
 */
export function createFieldRenderHelper(): IFieldRenderHelper {
  instance ??= new FieldRenderHelper()
  return instance
}

/**
 * 重置字段渲染助手实例
 */
export function resetFieldRenderHelper(): void {
  instance = null
}

// ===== 快捷函数 =====

/**
 * 计算单个字段渲染状态
 * @param config 字段配置
 * @param row 数据行
 * @param checker 权限检查器
 * @returns 字段渲染状态
 */
export const computeFieldState = (config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState =>
  createFieldRenderHelper().computeFieldState(config, row, checker)

/**
 * 批量计算字段渲染状态
 * @param configs 字段配置数组
 * @param row 数据行
 * @param checker 权限检查器
 * @returns 字段渲染状态数组
 */
export const computeFieldStates = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] =>
  createFieldRenderHelper().computeFieldStates(configs, row, checker)

/**
 * 过滤可见字段配置
 * @param configs 字段配置数组
 * @param row 数据行
 * @param checker 权限检查器
 * @returns 可见字段配置数组
 */
export const filterVisibleFields = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] =>
  createFieldRenderHelper().filterVisibleFields(configs, row, checker)
