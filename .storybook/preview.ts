import type { Preview } from '@storybook/vue3'
import { setup } from '@storybook/vue3'
import { Spark } from '@spark-view/spark-component'
import { createLogger } from '@spark-view/spark-app'
import { APP_SERVICES } from '@spark-view/spark-utils'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// Storybook 7.x setup
setup((app) => {
  // 安装Element Plus
  app.use(ElementPlus)

  // 创建SPARK插件
  const sparkPlugin = Spark.createPlugin()
  app.use(sparkPlugin)

  // 创建应用级logger
  const appLogger = createLogger('Storybook', {
    level: 'debug',
    enableColors: true,
    showTimestamp: false
  })

  // 提供应用服务
  app.provide(APP_SERVICES, {
    logger: appLogger,
    router: null // Storybook环境中不需要路由
  })
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
  },
};

export default preview;