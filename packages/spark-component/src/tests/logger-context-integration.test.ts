/**
 * 页面层 Logger 集成测试
 *
 * 验证 useSparkComponent 返回的 logger 只依赖页面层 APP_SERVICES.logger：
 * 1. 页面层未提供 logger 时回退到 console
 * 2. 页面根提供 APP_SERVICES.logger 后组件使用该 logger
 * 3. 子组件继承页面层 logger，不再依赖局部 LOGGER 覆盖
 */

import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { Spark, useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import type { IAppServicesCapability, LoggerApi } from '@spark-view/spark-utils'

function createAppServices(logger: LoggerApi): IAppServicesCapability {
  return {
    router: {
      push: async () => undefined,
      replace: async () => undefined,
      back: () => undefined,
      currentRoute: undefined,
    },
    logger,
  }
}

describe('Logger Context Integration', () => {
  it('页面层未提供 logger 时回退到 console', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const TestComponent = defineComponent({
      setup() {
        const { context, logger } = useSparkComponent({ type: 'test-comp' })
        logger.info('test message')

        return () => h('div', { id: context.id }, 'test')
      }
    })

    const wrapper = mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })

    expect(wrapper.text()).toBe('test')
    expect(consoleInfoSpy).toHaveBeenCalled()

    consoleInfoSpy.mockRestore()
  })

  it('页面根提供 APP_SERVICES.logger 后组件使用页面 logger', async () => {
    const logs: string[] = []

    const customLogger: LoggerApi = {
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`)
    }

    const ChildComponent = defineComponent({
      setup() {
        const { context, logger } = useSparkComponent({ type: 'test-comp' })
        nextTick(() => {
          logger.info('custom message')
          logger.warn('warning message')
        })
        return () => h('div', { id: context.id }, 'child')
      }
    })

    const PageRoot = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'page-root' })
        sparkProvide(APP_SERVICES, createAppServices(customLogger))
        return () => h(ChildComponent)
      }
    })

    mount(PageRoot, {
      global: { plugins: [Spark.createPlugin()] }
    })

    await nextTick()
    await nextTick()

    expect(logs).toContain('INFO: custom message')
    expect(logs).toContain('WARN: warning message')
  })

  it('子组件继承页面层 APP_SERVICES.logger', async () => {
    const logs: string[] = []

    const customLogger: LoggerApi = {
      debug: (msg: string) => logs.push(`CUSTOM_DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`CUSTOM_INFO: ${msg}`),
      warn: (msg: string) => logs.push(`CUSTOM_WARN: ${msg}`),
      error: (msg: string) => logs.push(`CUSTOM_ERROR: ${msg}`)
    }

    const ChildComponent = defineComponent({
      name: 'ChildComponent',
      setup() {
        const { context, logger } = useSparkComponent({ type: 'child-comp' })

        logger.info('child message')

        return () => h('div', { id: context.id }, 'child')
      }
    })

    const PageRoot = defineComponent({
      name: 'PageRoot',
      setup() {
        const { context, logger, sparkProvide } = useSparkComponent({ type: 'parent-comp' })
        sparkProvide(APP_SERVICES, createAppServices(customLogger))
        logger.info('parent message')

        return () => h('div', { id: context.id }, [
          h('span', 'parent'),
          h(ChildComponent)
        ])
      }
    })

    Spark.register('child-comp', ChildComponent)

    mount(PageRoot, {
      global: { plugins: [Spark.createPlugin()] }
    })

    await nextTick()

    expect(logs).toContain('CUSTOM_INFO: parent message')
    expect(logs).toContain('CUSTOM_INFO: child message')
  })
})
