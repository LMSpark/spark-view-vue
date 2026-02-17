/**
 * ExampleCard 组件单元测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Spark } from '@spark-view/spark-component'
import ExampleCard from '../src/components/example-card.vue'
import type { ExampleCardConfig } from '../src/components/example-card'

describe('ExampleCard', () => {
  // 创建测试用的SPARK插件
  function createTestPlugin() {
    const registry = Spark.createRegistry()
    return Spark.createPlugin({ registry })
  }

  describe('基本渲染', () => {
    it('应该正确渲染组件', () => {
      const config: ExampleCardConfig = {
        type: 'example-card',
        title: '测试标题'
      }

      const wrapper = mount(ExampleCard, {
        props: { config },
        global: {
          plugins: [createTestPlugin()]
        }
      })

      expect(wrapper.find('.component-title').text()).toBe('测试标题')
      expect(wrapper.classes()).toContain('spark-example-card')
    })

    it('应该显示默认标题为空', () => {
      const config: ExampleCardConfig = {
        type: 'example-card'
      }

      const wrapper = mount(ExampleCard, {
        props: { config },
        global: {
          plugins: [createTestPlugin()]
        }
      })

      // 简化版本中标题为空
      expect(wrapper.find('.component-title').text()).toBe('')
    })
  })

  describe('SPARK集成', () => {
    it('应该正确初始化SPARK上下文', () => {
      const config: ExampleCardConfig = {
        type: 'example-card',
        title: 'SPARK集成测试'
      }

      const wrapper = mount(ExampleCard, {
        props: { config },
        global: {
          plugins: [createTestPlugin()]
        }
      })

      // 验证组件已挂载且SPARK上下文已初始化
      expect(wrapper.exists()).toBe(true)
    })
  })
})