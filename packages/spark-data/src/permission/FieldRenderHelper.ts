/**
 * 字段渲染助手
 *
 * 结合字段配置和权限，计算字段的最终渲染状态
 */

import type { IDataRow } from '../types'
import { FieldVisibility } from '../types'
import type { PermissionChecker } from './PermissionChecker'

// ── 类型 ──

export interface IFieldRenderConfig {
  field: string
  visible?: boolean
  editable?: boolean
  maskRule?: (value: unknown) => string
  label?: string
  width?: number | string
}

export interface IFieldRenderState {
  field: string
  visibility: FieldVisibility
  editable: boolean
  displayValue?: string
  shouldRender: boolean
}

export interface IFieldRenderHelper {
  computeFieldState(config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState
  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[]
  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[]
}

// ── 实现 ──

export class FieldRenderHelper implements IFieldRenderHelper {
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

  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] {
    return configs.map(c => this.computeFieldState(c, row, checker))
  }

  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] {
    return configs.filter(c => this.computeFieldState(c, row, checker).shouldRender)
  }
}

// ── 工厂 ──

let instance: IFieldRenderHelper | null = null

export function createFieldRenderHelper(): IFieldRenderHelper {
  instance ??= new FieldRenderHelper()
  return instance
}

export function resetFieldRenderHelper(): void {
  instance = null
}

/** 快捷函数 */
export const computeFieldState = (config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState =>
  createFieldRenderHelper().computeFieldState(config, row, checker)

export const computeFieldStates = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] =>
  createFieldRenderHelper().computeFieldStates(configs, row, checker)

export const filterVisibleFields = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] =>
  createFieldRenderHelper().filterVisibleFields(configs, row, checker)
