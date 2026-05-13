import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createRuleJsonSchema, createRuleTreePolicy } from '@spark-view/spark-page-config'

import {
  DEV_COMPONENT_METADATA,
  DEV_PROP_ENUMS,
  DEV_REQUIRED_PROPS,
  DEV_TYPES,
} from '@/views/app/dev-system/policies/devComponentMetadata'

const rulePolicy = createRuleTreePolicy(DEV_COMPONENT_METADATA)
const RULE_JSON_SCHEMA = createRuleJsonSchema(DEV_COMPONENT_METADATA)

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
    expect(labels).toBeDefined()
    expect(labels!.length).toBeGreaterThan(0)
    expect(labels!.some(item => item.value === 'div')).toBe(true)
    expect(DEV_TYPES.length).toBeGreaterThan(0)
    expect(labels!.some(item => item.value === DEV_TYPES[0])).toBe(true)

    // 2) props 枚举建议可用
    const enumProbe = Object.entries(DEV_PROP_ENUMS)
      .flatMap(([, propMap]) => Object.entries(propMap))
      .find(([, values]) => values.length > 0)

    expect(enumProbe).toBeDefined()
    const [propName, enumValues] = enumProbe!
    const getValueOptions = rulePolicy.getValueOptions
    if (getValueOptions === undefined) {
      throw new Error('rulePolicy.getValueOptions 未定义')
    }
    const options = getValueOptions(['props', propName])
    expect(options).toEqual(expect.arrayContaining(enumValues))

    // 3) 选中 type 时必填 props 自动注入
    const requiredProbe = Object.entries(DEV_REQUIRED_PROPS)
      .find(([, required]) => Object.keys(required).length > 0)

    expect(requiredProbe).toBeDefined()
    const [componentType, requiredProps] = requiredProbe!
    const getAutoPopulate = rulePolicy.getAutoPopulate
    if (getAutoPopulate === undefined) {
      throw new Error('rulePolicy.getAutoPopulate 未定义')
    }
    const autoPopulate = getAutoPopulate(['type'], componentType)
    expect(autoPopulate).toBeDefined()
    expect(autoPopulate![0]?.targetPath).toEqual([])
    expect(autoPopulate![0]?.entries).toEqual({ props: requiredProps })
  })

  it('Rule JSON Schema 的 type 枚举来自 DEV_TYPES', () => {
    const defs = (RULE_JSON_SCHEMA as Record<string, unknown>)['$defs'] as Record<string, unknown>
    const sparkNode = defs['sparkNode'] as Record<string, unknown>
    const properties = sparkNode['properties'] as Record<string, unknown>
    const typeSchema = properties['type'] as Record<string, unknown>
    const enums = typeSchema['enum'] as string[]

    expect(enums).toEqual(DEV_TYPES)
    expect(enums.length).toBeGreaterThan(0)
    expect(properties['id']).toBeDefined()
  })
})
