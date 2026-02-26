import type { Preview } from '@storybook/vue3'
import { setup } from '@storybook/vue3'
import { Spark } from '@spark-view/spark-component'
import { createLogger } from '@spark-view/spark-app'
import { APP_SERVICES } from '@spark-view/spark-utils'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import { createRouter, createMemoryHistory } from 'vue-router'

// Storybook 全局安装
setup((app) => {
  app.use(ElementPlus)
  // FormCreate.install 满足 ObjectPlugin 结构，用包装对象避免类型转换
  app.use({ install: (vueApp) => { formCreate.install(vueApp) } })

  // 安装内存路由：消除 FCPageRenderer 内部 useRouter/useRoute 的 Vue warn
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
  app.use(router)

  const sparkPlugin = Spark.createPlugin()
  app.use(sparkPlugin)

  const appLogger = createLogger('Storybook', {
    level: 'debug',
    enableColors: true,
    showTimestamp: false
  })

  app.provide(APP_SERVICES as symbol, {
    logger: appLogger,
    router: null
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