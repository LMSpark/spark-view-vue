/**
 * 能力系统集成测试
 * 
 * 验证 SPARK 能力系统的核心功能：
 * - Symbol-based CapabilityKey 的 provide/consume 流程
 * - 能力符号与接口的配对使用
 * - useSparkComponent 返回值完整性（无 use 别名）
 * - AppServicesCapability 结构验证
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { Spark, useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import {
  APP_SERVICES,
  DATA_SOURCE,
  SELECTION,
  GRID_INSTANCE,
  COLUMN_MANAGER,
  COLUMN_CONFIG,
  GRID_EVENTS,
  ROW_EVENTS,
  VALIDATION,
  defineCapability
} from '@spark-view/spark-utils'
import type {
  DataSourceCapability,
  EventsCapability
} from '@spark-view/spark-utils'

describe('Capability system integration', () => {
  /**
   * 创建测试用 Vue 应用插件
   */
  function createTestPlugin() {
    const registry = Spark.createRegistry()
    return { plugin: Spark.createPlugin({ registry }), registry }
  }

  describe('useSparkComponent return interface', () => {
    it('does NOT return use alias', () => {
      const { plugin } = createTestPlugin()

      const TestComp = defineComponent({
        setup() {
          const result = useSparkComponent({ type: 'test-comp' } as ComponentConfig)
          // 验证返回值包含 consume 但不包含 use
          expect(typeof result.consume).toBe('function')
          expect('use' in result).toBe(false)
          return () => h('div')
        }
      })

      mount(TestComp, {
        global: { plugins: [plugin] }
      })
    })

    it('returns all expected API methods', () => {
      const { plugin } = createTestPlugin()

      const TestComp = defineComponent({
        setup() {
          const result = useSparkComponent({ type: 'test-comp' } as ComponentConfig)

          // 核心状态
          expect(result.context).toBeDefined()
          expect(result.isVisible).toBeDefined()
          expect(result.isDisabled).toBeDefined()

          // 能力提供
          expect(typeof result.provide).toBe('function')
          expect(typeof result.provideEvents).toBe('function')
          expect(typeof result.getProvider).toBe('function')
          expect(typeof result.getInheritedProvider).toBe('function')

          // 能力消费
          expect(typeof result.consume).toBe('function')
          expect(typeof result.consumeEvents).toBe('function')

          // 生命周期
          expect(typeof result.initialize).toBe('function')
          expect(typeof result.destroy).toBe('function')

          // 工具
          expect(typeof result.logger).toBe('object')
          expect(typeof result.getComponent).toBe('function')
          expect(typeof result.isComponentRegistered).toBe('function')

          // 调试
          expect(typeof result.getContextChain).toBe('function')
          expect(typeof result.printCapabilityTree).toBe('function')

          return () => h('div')
        }
      })

      mount(TestComp, {
        global: { plugins: [plugin] }
      })
    })
  })

  describe('Symbol-based provide/consume', () => {
    it('provides and consumes with CapabilityKey via createSystem', () => {
      const { capabilities, createContext, rootContext } = Spark.createSystem()

      const parentCtx = createContext({ type: 'provider', id: 'p-1' }, rootContext)
      const childCtx = createContext({ type: 'consumer', id: 'c-1' }, parentCtx)

      // 使用 Symbol-based CapabilityKey 注册 provider  
      const provider = {
        name: DATA_SOURCE,
        implementation: {
          getData: () => [{ id: 1 }],
          refresh: () => Promise.resolve()
        }
      }
      capabilities.registerProvider(parentCtx, provider)

      // consumer 通过 parent chain 找到 provider
      const found = capabilities.getProvider(childCtx, DATA_SOURCE)
      expect(found).toBeTruthy()
      const impl = found!.implementation as DataSourceCapability
      expect(impl.getData()).toEqual([{ id: 1 }])
    })

    it('custom capability key with defineCapability', () => {
      const { capabilities, createContext, rootContext } = Spark.createSystem()
      interface CustomCapability { getValue(): string }
      const CUSTOM = defineCapability<CustomCapability>('test:custom-cap-sys')

      const parentCtx = createContext({ type: 'provider', id: 'p-2' }, rootContext)
      const childCtx = createContext({ type: 'consumer', id: 'c-2' }, parentCtx)

      capabilities.registerProvider(parentCtx, {
        name: CUSTOM,
        implementation: { getValue: () => 'hello from custom' }
      })

      const found = capabilities.getProvider(childCtx, CUSTOM)
      expect(found).toBeTruthy()
      const impl = found!.implementation as CustomCapability
      expect(impl.getValue()).toBe('hello from custom')
    })
  })

  describe('EventsCapability usage', () => {
    it('provides events and consumer can subscribe via createSystem', () => {
      const { capabilities, createContext, rootContext } = Spark.createSystem()

      const gridCtx = createContext({ type: 'grid', id: 'grid-1' }, rootContext)
      const rowCtx = createContext({ type: 'row', id: 'row-1' }, gridCtx)

      // Provider 注册事件能力
      const handler = vi.fn()
      const eventBus: Record<string, Array<(...args: unknown[]) => void>> = {}

      const eventImpl: EventsCapability = {
        on(event: string, fn: (...args: unknown[]) => void) {
          if (!eventBus[event]) eventBus[event] = []
          eventBus[event].push(fn)
        },
        off(event: string, fn: (...args: unknown[]) => void) {
          eventBus[event] = (eventBus[event] || []).filter(f => f !== fn)
        },
        emit(event: string, ...args: unknown[]) {
          (eventBus[event] || []).forEach(fn => fn(...args))
        }
      }

      capabilities.registerProvider(gridCtx, {
        name: GRID_EVENTS,
        implementation: eventImpl
      })

      // Consumer 通过 parent chain 找到事件能力
      const found = capabilities.getProvider(rowCtx, GRID_EVENTS)
      expect(found).toBeTruthy()

      const events = found!.implementation as EventsCapability
      events.on('rowClick', handler)
      events.emit!('rowClick', { id: 1 })

      expect(handler).toHaveBeenCalledWith({ id: 1 })
    })
  })

  describe('All capability symbols are defined', () => {
    it('core symbols exist and are unique', () => {
      const symbols = [
        APP_SERVICES,
        DATA_SOURCE,
        SELECTION,
        GRID_INSTANCE,
        COLUMN_MANAGER,
        COLUMN_CONFIG,
        GRID_EVENTS,
        ROW_EVENTS,
        VALIDATION
      ]

      // 全部是 symbol
      symbols.forEach(s => expect(typeof s).toBe('symbol'))

      // 全部唯一
      const uniqueSet = new Set(symbols)
      expect(uniqueSet.size).toBe(symbols.length)
    })
  })
})
