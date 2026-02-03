/**
 * 事件能力系统集成示例
 * 展示如何使用事件能力系统进行组件间通信
 */

import { defineComponent, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'

/**
 * 示例 1：父组件提供事件能力
 * Grid 组件提供事件，子组件可以订阅
 */
export const GridWithEventCapability = defineComponent({
  name: 'GridWithEventCapability',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    }
  },
  setup(props) {
    const { provideEvents, logger } = useSparkComponent(props.config)

    // 提供事件能力
    const events = provideEvents('gridEvents')

    // 模拟数据加载
    onMounted(() => {
      setTimeout(() => {
        const data = [
          { id: 1, name: 'Row 1' },
          { id: 2, name: 'Row 2' }
        ]
        
        // 通过事件能力发射数据加载事件
        events.emit('dataLoaded', data)
        logger.info('Grid data loaded, event emitted')
      }, 100)
    })

    // 模拟行点击
    const handleRowClick = (row: any) => {
      events.emit('rowClick', row)
      logger.info('Row clicked:', row)
    }

    return () => (
      <div class="grid-with-events">
        <div onClick={() => handleRowClick({ id: 1, name: 'Row 1' })}>
          Click Row 1
        </div>
        <div onClick={() => handleRowClick({ id: 2, name: 'Row 2' })}>
          Click Row 2
        </div>
      </div>
    )
  }
})

/**
 * 示例 2：子组件消费事件能力
 * Toolbar 组件订阅 Grid 的事件
 */
export const ToolbarWithEventConsumer = defineComponent({
  name: 'ToolbarWithEventConsumer',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    }
  },
  setup(props) {
    const { consumeEvents, logger } = useSparkComponent(props.config)

    // 消费事件能力并订阅事件
    const gridEvents = consumeEvents('gridEvents', {
      dataLoaded: (data: any[]) => {
        logger.info('Toolbar received dataLoaded event:', data)
        // 更新工具栏状态
      },
      
      rowClick: (row: any) => {
        logger.info('Toolbar received rowClick event:', row)
        // 响应行点击
      }
    })

    // 也可以动态添加更多监听器
    onMounted(() => {
      if (gridEvents) {
        gridEvents.on('selection', (selectedRows: any[]) => {
          logger.info('Selection changed:', selectedRows)
        })
      }
    })

    return () => (
      <div class="toolbar-with-events">
        <button>Refresh</button>
        <button>Export</button>
      </div>
    )
  }
})

/**
 * 示例 3：跨层事件传播
 * Page → Grid → Column 的事件流
 */

// Page 组件
export const PageWithEvents = defineComponent({
  name: 'PageWithEvents',
  setup() {
    const config: ComponentConfig = {
      type: 'page',
      id: 'demo-page'
    }
    
    const { provideEvents } = useSparkComponent(config)
    
    // Page 提供全局事件
    const pageEvents = provideEvents('pageEvents')
    
    const handleRefresh = () => {
      pageEvents.emit('refreshData')
    }

    return () => (
      <div>
        <button onClick={handleRefresh}>Refresh All</button>
        {/* Grid 和 其他组件 */}
      </div>
    )
  }
})

// Grid 消费 Page 事件，同时提供自己的事件
export const GridInPage = defineComponent({
  name: 'GridInPage',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    }
  },
  setup(props) {
    const { provideEvents, consumeEvents, logger } = useSparkComponent(props.config)
    
    // 消费 Page 事件
    consumeEvents('pageEvents', {
      refreshData: () => {
        logger.info('Grid refreshing data...')
        loadData()
      }
    })
    
    // 提供 Grid 事件
    const gridEvents = provideEvents('gridEvents')
    
    const loadData = () => {
      // 加载数据...
      gridEvents.emit('dataLoaded', [])
    }

    return () => <div class="grid">Grid Content</div>
  }
})

/**
 * 示例 4：使用 createEventCapabilityProvider 手动创建
 */
export function manualEventCapabilityExample() {
  // Note: This is a TypeScript example, actual implementation would use proper imports
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createEventCapabilityProvider } = require('@spark-view/spark-component')
  
  // 创建事件能力提供者
  const { provider, emitter } = createEventCapabilityProvider('customEvents')
  
  // 发射事件
  emitter.emit('customEvent', { data: 'test' })
  
  // 监听事件
  emitter.on('customEvent', (payload: unknown) => {
    // eslint-disable-next-line no-console
    console.log('Custom event received:', payload)
  })
  
  // 一次性监听
  emitter.once?.('oneTimeEvent', (payload: unknown) => {
    // eslint-disable-next-line no-console
    console.log('This will only fire once:', payload)
  })
  
  return { provider, emitter }
}

/**
 * 示例 5：复杂场景 - Form 与多个 Field 的事件通信
 */

// Form 组件提供验证和提交事件
export const FormWithEventCapability = defineComponent({
  name: 'FormWithEventCapability',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    }
  },
  setup(props) {
    const { provideEvents } = useSparkComponent(props.config)
    
    const formEvents = provideEvents('formEvents')
    
    const handleSubmit = () => {
      // 触发验证事件
      formEvents.emit('validate')
      
      // 收集所有字段值后提交
      setTimeout(() => {
        formEvents.emit('submit', { /* form data */ })
      }, 100)
    }
    
    return () => (
      <div class="form">
        {/* Fields will go here */}
        <button onClick={handleSubmit}>Submit</button>
      </div>
    )
  }
})

// Field 组件消费 Form 事件
export const FieldWithEventConsumer = defineComponent({
  name: 'FieldWithEventConsumer',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    },
    fieldName: String
  },
  setup(props) {
    const { consumeEvents, provideEvents, logger } = useSparkComponent(props.config)
    
    // 消费 Form 事件
    consumeEvents('formEvents', {
      validate: () => {
        logger.info(`Validating field: ${props.fieldName}`)
        // 执行验证...
        fieldEvents.emit('validated', { field: props.fieldName, valid: true })
      }
    })
    
    // 提供 Field 事件供其他组件使用
    const fieldEvents = provideEvents('fieldEvents')
    
    const handleChange = (value: any) => {
      fieldEvents.emit('change', { field: props.fieldName, value })
    }
    
    return () => (
      <input
        type="text"
        onChange={(e) => handleChange((e.target as HTMLInputElement).value)}
      />
    )
  }
})

/**
 * 示例 6：与原有 ComponentEventEmitter 的对比
 */

// 旧方式：使用 ComponentEventEmitter
import { createComponentEventEmitter } from '@spark-view/spark-component'

export const OldWayComponent = defineComponent({
  name: 'OldWayComponent',
  setup() {
    // 需要手动创建和管理
    const events = createComponentEventEmitter('OldWay')
    
    events.addEventListener('test', (data) => {
      console.log(data)
    })
    
    events.emit('test', 'data')
    
    // 没有与能力系统集成，需要手动传递
    return { events }
  }
})

// 新方式：通过能力系统
export const NewWayComponent = defineComponent({
  name: 'NewWayComponent',
  props: {
    config: {
      type: Object as () => ComponentConfig,
      required: true
    }
  },
  setup(props) {
    const { provideEvents } = useSparkComponent(props.config)
    
    // 自动与能力系统集成
    const events = provideEvents('events')
    
    events.on('test', (data: unknown) => {
      // Use logger instead of console
      if (data) {
        // Process event
      }
    })
    
    events.emit('test', 'data')
    
    // 子组件可以通过 consumeEvents 自动消费
    return {}
  }
})

/**
 * 示例 7：事件能力的优势
 */
export function eventCapabilityAdvantages() {
  return {
    advantages: [
      '✅ 自动生命周期管理 - 组件销毁时自动断开事件连接',
      '✅ 跨层传播 - 子组件可以消费任意父级的事件能力',
      '✅ 类型安全 - TypeScript 支持事件类型定义',
      '✅ 解耦设计 - 组件不需要知道事件提供者的具体实现',
      '✅ 延迟绑定 - 消费者可以在提供者创建之前注册',
      '✅ 统一接口 - 与能力系统的其他功能（方法、数据流）一致',
      '✅ 可观测性 - 可以通过 CapabilityManager 追踪事件连接状态'
    ],
    
    comparison: {
      before: 'ComponentEventEmitter - 独立的事件系统，需要手动管理',
      after: 'EventCapability - 集成到能力系统，自动管理生命周期'
    }
  }
}

// 导出所有示例
export default {
  GridWithEventCapability,
  ToolbarWithEventConsumer,
  PageWithEvents,
  GridInPage,
  FormWithEventCapability,
  FieldWithEventConsumer,
  OldWayComponent,
  NewWayComponent,
  manualEventCapabilityExample,
  eventCapabilityAdvantages
}
