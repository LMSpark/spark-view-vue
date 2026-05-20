import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createRuleJsonSchema, createRuleTreePolicy } from '@spark-view/spark-page-config/page/workspace'

import {
  DEV_COMPONENT_METADATA,
  DEV_PROP_ENUMS,
  DEV_REQUIRED_PROPS,
  DEV_TYPES,
} from '@/views/app/dev-system/policies/devComponentMetadata'

const rulePolicy = createRuleTreePolicy(DEV_COMPONENT_METADATA)
const RULE_JSON_SCHEMA = createRuleJsonSchema(DEV_COMPONENT_METADATA)

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value !== null && value !== undefined) return value
  throw new Error(message)
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }
  throw new Error(message)
}

function requireStringArray(value: unknown, message: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  throw new Error(message)
}

describe('Ring5 验收闭环（SkillCatalog + DevSystem）', () => {
  it('SkillCatalog 页面可展示组件列表、Props 明细、类型字典', async () => {
    const mod = await import('@/views/app/SkillCatalog.vue')
    const SkillCatalog = mod.default

    const wrapper = mount(SkillCatalog, {
      global: {
        stubs: {
          'el-input': true,
          'el-select': true,
          'el-option': true,
          'el-radio-group': true,
          'el-radio-button': true,
        },
      },
    })

    // 列表可见
    expect(wrapper.text()).toContain('2 个组件')
    expect(wrapper.text()).toContain('r-table')
    expect(wrapper.text()).toContain('r-text')

    // 点击卡片展开 props
    const cards = wrapper.findAll('.skill-card')
    expect(cards.length).toBe(2)
    await cards[0]!.trigger('click')
    expect(wrapper.find('.props-table').exists()).toBe(true)

    // 类型字典开关可用
    const dictToggle = wrapper.find('.skill-catalog__dict-toggle')
    expect(dictToggle.exists()).toBe(true)
    await dictToggle.trigger('click')
    expect(wrapper.find('.type-dict').exists()).toBe(true)
  })

  it('DevSystem Rule 编辑策略支持 type 下拉、props 枚举建议、必填属性自动注入', () => {
    // 1) type 下拉可用（来自 DEV_TYPES + 补充标签）
    const getValueLabels = rulePolicy.getValueLabels
    if (getValueLabels === undefined) {
      throw new Error('rulePolicy.getValueLabels 未定义')
    }
    const labels = getValueLabels(['type'])
    const typeLabels = requireValue(labels, 'type labels 未生成')
    expect(typeLabels.length).toBeGreaterThan(0)
    expect(typeLabels.some(item => item.value === 'div')).toBe(true)
    expect(DEV_TYPES.length).toBeGreaterThan(0)
    expect(typeLabels.some(item => item.value === DEV_TYPES[0])).toBe(true)

    // 2) props 枚举建议可用
    const enumProbe = Object.entries(DEV_PROP_ENUMS)
      .flatMap(([, propMap]) => Object.entries(propMap))
      .find(([, values]) => values.length > 0)

    const [propName, enumValues] = requireValue(enumProbe, '未找到 props 枚举样例')
    const getValueOptions = rulePolicy.getValueOptions
    if (getValueOptions === undefined) {
      throw new Error('rulePolicy.getValueOptions 未定义')
    }
    const options = getValueOptions(['props', propName])
    expect(options).toEqual(expect.arrayContaining(enumValues))

    // 3) 选中 type 时必填 props 自动注入
    const requiredProbe = Object.entries(DEV_REQUIRED_PROPS)
      .find(([, required]) => Object.keys(required).length > 0)

    const [componentType, requiredProps] = requireValue(requiredProbe, '未找到必填 props 样例')
    const getAutoPopulate = rulePolicy.getAutoPopulate
    if (getAutoPopulate === undefined) {
      throw new Error('rulePolicy.getAutoPopulate 未定义')
    }
    const autoPopulate = getAutoPopulate(['type'], componentType)
    const autoPopulateEntries = requireValue(autoPopulate, 'type 自动填充规则未生成')
    expect(autoPopulateEntries[0]?.targetPath).toEqual([])
    expect(autoPopulateEntries[0]?.entries).toEqual({ props: requiredProps })
  })

  it('Rule JSON Schema 的 type 枚举来自 DEV_TYPES', () => {
    const defs = requireRecord(RULE_JSON_SCHEMA['$defs'], 'Rule JSON Schema 缺少 $defs')
    const sparkNode = requireRecord(defs['sparkNode'], 'Rule JSON Schema 缺少 sparkNode')
    const properties = requireRecord(sparkNode['properties'], 'sparkNode 缺少 properties')
    const typeSchema = requireRecord(properties['type'], 'sparkNode.type schema 缺失')
    const enums = requireStringArray(typeSchema['enum'], 'sparkNode.type enum 无效')

    expect(enums).toEqual(DEV_TYPES)
    expect(enums.length).toBeGreaterThan(0)
    expect(properties['id']).toBeDefined()
  })
})
