/**
 * 配置验证器
 */

import type {
  RuleConfig,
  PageDataConfig,
  ValidationError
} from '../types'

/**
 * 验证规则配置
 */
export function validateRuleConfig(config: RuleConfig): ValidationError[] {
  const errors: ValidationError[] = []

  if (!config.type) {
    errors.push({ field: 'type', message: '组件类型不能为空' })
  }

  // 验证子元素
  if (config.children) {
    if (!Array.isArray(config.children)) {
      errors.push({
        field: 'children',
        message: 'children 必须是数组',
        value: config.children
      })
    }
  }

  // 验证事件处理器
  if (config.on) {
    if (typeof config.on !== 'object') {
      errors.push({
        field: 'on',
        message: 'on 必须是对象',
        value: config.on
      })
    }
  }

  return errors
}

/**
 * 验证页面数据配置（DataSet 实例）
 */
export function validatePageDataConfig(config: PageDataConfig): ValidationError[] {
  const errors: ValidationError[] = []

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (config === null || typeof config !== 'object') {
    errors.push({
      field: 'root',
      message: '页面数据必须是 DataSet 实例',
      value: config
    })
  }

  return errors
}

/**
 * 批量验证规则配置
 */
export function validateRules(rules: RuleConfig[]): ValidationError[] {
  const errors: ValidationError[] = []

  const validateRecursive = (rule: RuleConfig, path: string) => {
    const ruleErrors = validateRuleConfig(rule)
    errors.push(...ruleErrors.map(e => ({
      ...e,
      field: `${path}.${e.field}`
    })))

    if (Array.isArray(rule.children)) {
      for (const [index, child] of rule.children.entries()) {
        if (typeof child === 'object') {
          validateRecursive(child, `${path}.children[${index}]`)
        }
      }
    }
  }

  for (const [index, rule] of rules.entries()) {
    validateRecursive(rule, `rules[${index}]`)
  }

  return errors
}
