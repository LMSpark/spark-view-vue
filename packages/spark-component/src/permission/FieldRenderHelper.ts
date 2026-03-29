/**
 * 字段渲染助手
 *
 * 结合字段配置和权限，计算字段的最终渲染状态
 */

import type { IDataRow } from '@spark-view/spark-data'
import { FieldVisibility } from '@spark-view/spark-data'
import type { PermissionChecker } from './PermissionChecker'

export interface IFieldRenderConfig {
  field: string
  visible?: boolean
  editable?: boolean
  label?: string
  width?: number | string
}

export interface IFieldRenderState {
  field: string
  visibility: FieldVisibility
  readable: boolean
  editable: boolean
  displayValue: string | undefined
  shouldRender: boolean
}

export interface IFieldRenderHelper {
  computeFieldState(config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState
  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[]
  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[]
}

export class FieldRenderHelper implements IFieldRenderHelper {
  computeFieldState(config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState {
    const { field } = config
    const visibility = checker.getFieldVisibility(field, row)
    const readable = visibility !== FieldVisibility.Hidden && (config.visible !== false)
    const editable = checker.canEdit(row)
      && checker.isFieldEditable(field, row)
      && (config.editable !== false)
    const shouldRender = readable

    let displayValue: string | undefined
    if (readable) {
      const value = row[field]
      displayValue = value !== undefined && value !== null ? String(value) : ''
    }

    return { field, visibility, readable, editable, displayValue, shouldRender }
  }

  computeFieldStates(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] {
    return configs.map(config => this.computeFieldState(config, row, checker))
  }

  filterVisibleFields(configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] {
    return configs.filter(config => this.computeFieldState(config, row, checker).shouldRender)
  }
}

const _instance: IFieldRenderHelper = new FieldRenderHelper()

export function createFieldRenderHelper(): IFieldRenderHelper {
  return _instance
}

export const computeFieldState = (config: IFieldRenderConfig, row: IDataRow, checker: PermissionChecker): IFieldRenderState =>
  createFieldRenderHelper().computeFieldState(config, row, checker)

export const computeFieldStates = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderState[] =>
  createFieldRenderHelper().computeFieldStates(configs, row, checker)

export const filterVisibleFields = (configs: IFieldRenderConfig[], row: IDataRow, checker: PermissionChecker): IFieldRenderConfig[] =>
  createFieldRenderHelper().filterVisibleFields(configs, row, checker)