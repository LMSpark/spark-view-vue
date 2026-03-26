/**
 * Logger 上下文集成测试
 * 
 * 验证 Logger 与 SparkCapabilityContext 的集成，包括：
 * 1. 默认使用字符串模式的 logger
 * 2. 提供自定义 logger provider 后自动切换
 * 3. 子组件继承父组件的 logger provider
 */

import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { Spark, useSparkComponent } from '@spark-view/spark-component'
import { LOGGER } from '@spark-view/spark-utils'
import type { LoggerApi } from '@spark-view/spark-utils'

describe('Logger Context Integration', () => {
  it('使用默认 console logger（字符串模式）', () => {
    const TestComponent = defineComponent({
      setup() {
        const { context, logger } = useSparkComponent({ type: 'test-comp' })
        
        // 调用 logger（默认输出到 console）
        logger.info('test message')
        
        return () => h('div', { id: context.id }, 'test')
      }
    })
    
    const wrapper = mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })
    
    expect(wrapper.text()).toBe('test')
  })

  it('使用自定义 logger provider（上下文模式）', async () => {
    const logs: string[] = []
    
    // 创建自定义 logger 实现
    const customLogger: LoggerApi = {
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`)
    }
    
    const TestComponent = defineComponent({
      setup() {
        const { context, logger, sparkProvide } = useSparkComponent({ type: 'test-comp' })
        
        // 使用 LOGGER Symbol 提供自定义 logger（能力系统使用 Symbol key，非字符串）
        sparkProvide(LOGGER, customLogger)
        
        // 等待下一个 tick 确保 provider 注册完成
        nextTick(() => {
          logger.info('custom message')
          logger.warn('warning message')
        })
        
        return () => h('div', { id: context.id }, 'test')
      }
    })
    
    mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })
    
    // 等待 setup 内的 nextTick 回调执行
    await nextTick()
    await nextTick()
    
    // 验证使用了自定义 logger
    expect(logs).toContain('INFO: custom message')
    expect(logs).toContain('WARN: warning message')
  })

  it('子组件继承父组件的 logger provider', async () => {
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
    
    const ParentComponent = defineComponent({
      name: 'ParentComponent',
      setup() {
        const { context, logger, sparkProvide } = useSparkComponent({ type: 'parent-comp' })
        
        // 父组件使用 LOGGER Symbol 提供自定义 logger
        sparkProvide(LOGGER, customLogger)
        
        logger.info('parent message')
        
        return () => h('div', { id: context.id }, [
          h('span', 'parent'),
          h(ChildComponent)
        ])
      }
    })
    
    Spark.register('child-comp', ChildComponent)
    
    mount(ParentComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })
    
    // 等待父子组件渲染完成
    await nextTick()
    
    // 验证父子组件都使用了自定义 logger
    expect(logs).toContain('CUSTOM_INFO: parent message')
    expect(logs).toContain('CUSTOM_INFO: child message')
  })

  it('动态切换 logger（从默认到自定义）', async () => {
    const logs: string[] = []
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    
    const customLogger: LoggerApi = {
      debug: () => {},
      info: (msg: string) => logs.push(`CUSTOM: ${msg}`),
      warn: () => {},
      error: () => {}
    }
    
    const TestComponent = defineComponent({
      setup() {
        const { context, logger, sparkProvide } = useSparkComponent({ type: 'test-comp' })
        
        // 第一次调用：使用默认 logger
        logger.info('before custom')
        
        // 使用 LOGGER Symbol 提供自定义 logger
        sparkProvide(LOGGER, customLogger)
        
        // 第二次调用：应该使用自定义 logger
        nextTick(() => {
          logger.info('after custom')
        })
        
        return () => h('div', { id: context.id }, 'test')
      }
    })
    
    mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })
    
    // 等待 setup 内的 nextTick 回调执行
    await nextTick()
    await nextTick()
    
    // 验证第一次使用了 console
    expect(consoleInfoSpy).toHaveBeenCalled()
    
    // 验证第二次使用了自定义 logger
    expect(logs).toContain('CUSTOM: after custom')
    
    consoleInfoSpy.mockRestore()
  })

  it('组件自身提供 LOGGER 后 logger 代理使用自定义实现', async () => {
    const logs: string[] = []
    
    const customLogger: LoggerApi = {
      debug: () => {},
      info: (msg: string) => logs.push(`IMPL: ${msg}`),
      warn: () => {},
      error: () => {}
    }
    
    const TestComponent = defineComponent({
      setup() {
        const { logger, sparkProvide } = useSparkComponent({ type: 'test-comp' })
        
        // 使用 LOGGER Symbol 提供自定义 logger
        sparkProvide(LOGGER, customLogger)
        
        nextTick(() => {
          logger.info('with provider structure')
        })
        
        return () => h('div', 'test')
      }
    })
    
    mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })
    
    // 等待 setup 内的 nextTick 回调执行
    await nextTick()
    await nextTick()
    
    expect(logs).toContain('IMPL: with provider structure')
  })
})
