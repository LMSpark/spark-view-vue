/**
 * 字段渲染助手实现
 * 
 * 用于计算字段的最终渲染状态（结合配置和权限）
 */

import type {
  IFieldRenderHelper,
  IFieldRenderConfig,
  IFieldRenderState,
  IPermissionDataRow,
  IPermissionChecker
} from '../types/permission'

import { FieldVisibility } from '../types/permission'

/**
 * 字段渲染助手默认实现
 */
export class FieldRenderHelper implements IFieldRenderHelper {
  /**
   * 计算字段渲染状态
   */
  computeFieldState(
    config: IFieldRenderConfig,
    row: IPermissionDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState {
    const { field } = config
    const rawValue = row[field]
    
    // 1. 计算读权限：可见性（3种状态）
    const visibility = checker.getFieldVisibility(field, row)
    
    // 2. 计算写权限：可编辑性（2种状态）
    const editable = checker.isFieldEditable(field, row) && (config.editable !== false)
    
    // 3. 计算显示值（根据可见性）
    let displayValue: string | undefined
    const shouldRender = visibility !== FieldVisibility.Hidden && (config.visible !== false)
    
    if (shouldRender) {
      if (visibility === FieldVisibility.Masked) {
        // 脱敏显示
        displayValue = checker.maskFieldValue(field, rawValue, row)
      } else {
        // 完全可见
        displayValue = String(rawValue ?? '')
      }
    }
    
    return {
      field,
      visibility,      // 读权限（3种）
      editable,        // 写权限（2种）
      displayValue,
      rawValue,
      shouldRender
    }
  }
  
  /**
   * 批量计算字段渲染状态
   */
  computeFieldStates(
    configs: IFieldRenderConfig[],
    row: IPermissionDataRow,
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
    row: IPermissionDataRow,
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
  if (!helperInstance) {
    helperInstance = new FieldRenderHelper()
  }
  return helperInstance
}

/**
 * 快捷方法：计算字段状态
 */
export const computeFieldState = (
  config: IFieldRenderConfig,
  row: IPermissionDataRow,
  checker: IPermissionChecker
): IFieldRenderState => {
  return createFieldRenderHelper().computeFieldState(config, row, checker)
}

/**
 * 快捷方法：批量计算字段状态
 */
export const computeFieldStates = (
  configs: IFieldRenderConfig[],
  row: IPermissionDataRow,
  checker: IPermissionChecker
): IFieldRenderState[] => {
  return createFieldRenderHelper().computeFieldStates(configs, row, checker)
}

/**
 * 快捷方法：过滤可见字段
 */
export const filterVisibleFields = (
  configs: IFieldRenderConfig[],
  row: IPermissionDataRow,
  checker: IPermissionChecker
): IFieldRenderConfig[] => {
  return createFieldRenderHelper().filterVisibleFields(configs, row, checker)
}
