import type { Meta, StoryObj } from '@storybook/vue3'
import ExampleCard from '../src/components/example-card.vue'
import type { ExampleCardConfig } from '../src/components/example-card'

const meta: Meta<typeof ExampleCard> = {
  title: 'SPARK Components/ExampleCard',
  component: ExampleCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '一个示例卡片组件'
      }
    }
  },
  argTypes: {
    config: {
      description: '组件配置对象',
      control: { type: 'object' }
    }
  },
  args: {
    config: {
      type: 'example-card',
      title: 'ExampleCard 示例'
    } as ExampleCardConfig
  }
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    config: {
      type: 'example-card',
      title: '默认ExampleCard'
    } as ExampleCardConfig
  }
}

export const Loading: Story = {
  args: {
    config: {
      type: 'example-card',
      title: '加载中...',
      loading: true
    } as ExampleCardConfig
  }
}

export const WithCustomData: Story = {
  args: {
    config: {
      type: 'example-card',
      title: '自定义数据',
      data: {
        message: '来自Storybook的自定义消息',
        timestamp: new Date().toISOString()
      }
    } as ExampleCardConfig
  }
}