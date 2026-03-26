/**
 * 列验证规则 → Element Plus FormItemRule 转换
 *
 * 将 spark-data 的框架无关 ColumnValidationRule 转换为 el-form-item 可消费的 rules。
 * 仅在渲染层使用，spark-data 不依赖任何 UI 框架。
 */

import type { ColumnValidationRule } from '@spark-view/spark-data'
import type { DataColumn } from '@spark-view/spark-data'
import { extractColumnRules } from '@spark-view/spark-data'

/** Element Plus FormItemRule 最小子集（避免直接依赖 element-plus 类型） */
export interface FormItemRule {
  required?: boolean
  message?: string
  trigger?: string | string[]
  type?: string
  min?: number
  max?: number
  pattern?: RegExp
  validator?: (rule: unknown, value: unknown, callback: (error?: Error) => void) => void
}

/**
 * 将框架无关的 ColumnValidationRule 数组转为 Element Plus FormItemRule 数组。
 *
 * @param rules - 来自 extractColumnRules() 的描述符
 * @returns Element Plus 表单验证规则
 */
export function toElFormRules(rules: ColumnValidationRule[]): FormItemRule[] {
  return rules.map(rule => convertRule(rule))
}

/**
 * 从 DataColumn 直接生成 Element Plus 表单验证规则（便捷函数）。
 *
 * @param column - 列定义
 * @returns Element Plus 表单验证规则数组
 */
export function columnToFormRules(column: DataColumn): FormItemRule[] {
  return toElFormRules(extractColumnRules(column))
}

function convertRule(rule: ColumnValidationRule): FormItemRule {
  switch (rule.type) {
    case 'required':
      return { required: true, message: rule.message, trigger: 'blur' }

    case 'minLength':
      return {
        min: rule.value as number,
        message: rule.message,
        trigger: 'blur',
      }

    case 'maxLength':
      return {
        max: rule.value as number,
        message: rule.message,
        trigger: 'blur',
      }

    case 'min':
      return {
        validator: (_r: unknown, value: unknown, callback: (error?: Error) => void) => {
          if (value === null || value === undefined || value === '') {
            callback()
            return
          }
          const num = Number(value)
          if (isNaN(num) || num < (rule.value as number)) {
            callback(new Error(rule.message))
          } else {
            callback()
          }
        },
        trigger: 'blur',
      }

    case 'max':
      return {
        validator: (_r: unknown, value: unknown, callback: (error?: Error) => void) => {
          if (value === null || value === undefined || value === '') {
            callback()
            return
          }
          const num = Number(value)
          if (isNaN(num) || num > (rule.value as number)) {
            callback(new Error(rule.message))
          } else {
            callback()
          }
        },
        trigger: 'blur',
      }

    case 'pattern': {
      let regex: RegExp | undefined
      try { regex = new RegExp(rule.value as string) } catch { /* invalid pattern */ }
      return regex
        ? { pattern: regex, message: rule.message, trigger: 'blur' }
        : { validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) => { cb(new Error(`无效正则: ${String(rule.value)}`)) }, trigger: 'blur' }
    }

    case 'type':
      return { message: rule.message, trigger: 'blur' }
  }
}
