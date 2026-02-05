/**
 * 字段渲染助手实现
 * 
 * 用于计算字段的最终渲染状态（结合配置和权限）
 */

import type {
  ComponentDataRow,
  IPermissionChecker
} from '../data-types'

import { FieldVisibility } from '../data-types'

// 字段渲染配置接口
export interface IFieldRenderConfig {
  /** 字段名（用于权限匹配） */
  field: string
  /** 字段是否可见（可被权限覆盖） */
  visible?: boolean
  /** 字段是否可编辑（可被权限覆盖） */
  editable?: boolean
  /** 自定义脱敏规则（可选） */
  maskRule?: (value: unknown) => string
  /** 字段标签 */
  label?: string
  /** 字段宽度（表格列宽） */
  width?: number | string
}

export interface IFieldRenderState {
  /** 字段名 */
  field: string
  /** 可见性状态 */
  visibility: FieldVisibility
  /** 是否可编辑 */  
  editable: boolean
  /** 显示值（可能是脱敏值） */
  displayValue?: string
  /** 是否应该渲染此字段 */
  shouldRender: boolean
}

export interface IFieldRenderHelper {
  computeFieldState(
    config: IFieldRenderConfig,
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState
  
  computeFieldStates(
    configs: IFieldRenderConfig[],
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState[]
  
  filterVisibleFields(
    configs: IFieldRenderConfig[],
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderConfig[]
}

/**
 * 字段渲染助手默认实现
 */
export class FieldRenderHelper implements IFieldRenderHelper {
  /**
   * 计算字段渲染状态
   */
  computeFieldState(
    config: IFieldRenderConfig,
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState {
    const { field } = config
    
    // 1. 计算读权限：可见性（3种状态）
    const visibility = checker.getFieldVisibility(field, row)
    
    // 2. 计算写权限：可编辑性（2种状态）
    const editable = checker.isFieldEditable(field, row) && (config.editable !== false)
    
    // 3. 计算显示值（根据可见性）
    let displayValue: string | undefined
    const shouldRender = visibility !== FieldVisibility.Hidden && (config.visible !== false)
    
    if (shouldRender) {
      // 后端返回的值已经是处理后的（Visible 或 Masked）
      const value = row[field] 
      displayValue = value !== undefined && value !== null ? String(value) : ''
    }
    // Hidden 时不设置 displayValue，保持 undefined
    
    return {
      field,
      visibility,      // 读权限（3种）
      editable,        // 写权限（2种）
      displayValue,    // 后端返回的值
      shouldRender
    }
  }
  
  /**
   * 批量计算字段渲染状态
   */
  computeFieldStates(
    configs: IFieldRenderConfig[],
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState[] {
    return configs.map(config => 
      this.computeFieldState(config, row, checker)
    )
  }
  
  /**
   * 过滤出可见字段配置
   */
  filterVisibleFields(
    configs: IFieldRenderConfig[],
    row: ComponentDataRow,
    checker: IPermissionChecker
  ): IFieldRenderConfig[] {
    return configs.filter(config => {
      const state = this.computeFieldState(config, row, checker)
      return state.shouldRender
    })
  }
}

/**
 * 创建字段渲染助手实例（单例）
 */
let helperInstance: IFieldRenderHelper | null = null

export function createFieldRenderHelper(): IFieldRenderHelper {
  helperInstance ??= new FieldRenderHelper()
  return helperInstance
}

/**
 * 快捷方法：计算字段状态
 */
export const computeFieldState = (
  config: IFieldRenderConfig,
  row: ComponentDataRow,
  checker: IPermissionChecker
): IFieldRenderState => {
  return createFieldRenderHelper().computeFieldState(config, row, checker)
}

/**
 * 快捷方法：批量计算字段状态
 */
export const computeFieldStates = (
  configs: IFieldRenderConfig[],
  row: ComponentDataRow,
  checker: IPermissionChecker
): IFieldRenderState[] => {
  return createFieldRenderHelper().computeFieldStates(configs, row, checker)
}

/**
 * 快捷方法：过滤可见字段
 */
export const filterVisibleFields = (
  configs: IFieldRenderConfig[],
  row: ComponentDataRow,
  checker: IPermissionChecker
): IFieldRenderConfig[] => {
  return createFieldRenderHelper().filterVisibleFields(configs, row, checker)
}
