// app/components/index.ts
// 自定义组件注册文件

import { Spark } from '../features/spark'

// 导入你的组件
import MyCustomButton from './MyCustomButton.vue'
import MyForm from './MyForm.vue'
import MyDialog from './MyDialog.vue'

/**
 * 注册应用自定义组件
 */
export function registerCustomComponents() {
  // 注册单个组件
  Spark.register({
    type: 'my-custom-button',
    name: 'My Custom Button',
    version: '1.0.0',
    component: MyCustomButton,
    providers: [{
      name: 'button-api',
      implementation: {
        click: () => console.log('Custom button clicked')
      }
    }]
  })

  // 注册多个组件
  Spark.register([
    {
      type: 'my-form',
      name: 'My Form',
      version: '1.0.0',
      component: MyForm
    },
    {
      type: 'my-dialog',
      name: 'My Dialog',
      version: '1.0.0',
      component: MyDialog,
      consumers: [{
        capabilityName: 'dialog-manager'
      }]
    }
  ])
}