// app/components/index.ts
// 自定义组件注册文件

// import { Spark } from '../../features/spark'

// 导入你的组件
// import MyCustomButton from './MyCustomButton.vue'
// import MyForm from './MyForm.vue'
// import MyDialog from './MyDialog.vue

/**
 * 注册应用自定义组件 - 使用 Spark 便捷方法（推荐）
 */
export function registerCustomComponents() {
  // if (!manager) {
  //   throw new Error('Manager is required for component registration')
  // }

  // 使用简短别名
  // Spark.registerComponent({
  //   type: 'my-custom-button',
  //   name: 'My Custom Button',
  //   version: '1.0.0',
  //   component: MyCustomButton,
  //   providers: [{
  //     name: 'button-api',
  //     implementation: {
  //       click: () => console.log('Custom button clicked')
  //     }
  //   }]
  // }, manager)

  // 注册多个组件
  // Spark.registerComponents([
  //   {
  //     type: 'my-form',
  //     name: 'My Form',
  //     version: '1.0.0',
  //     component: MyForm
  //   },
  //   {
  //     type: 'my-dialog',
  //     name: 'My Dialog',
  //     version: '1.0.0',
  //     component: MyDialog,
  //     consumers: [{
  //       capabilityName: 'dialog-manager'
  //     }]
  //   }
  // ], manager)
}

/**
 * 注册应用自定义组件 - 使用 Spark.register（备选方案）
 */
export function registerCustomComponentsViaSpark() {
  // 注册单个组件
  // Spark.register({
  //   type: 'my-custom-button',
  //   name: 'My Custom Button',
  //   version: '1.0.0',
  //   component: MyCustomButton,
  //   providers: [{
  //     name: 'button-api',
  //     implementation: {
  //       click: () => console.log('Custom button clicked')
  //     }
  //   }]
  // }, manager)

  // 注册多个组件
  // Spark.register([
  //   {
  //     type: 'my-form',
  //     name: 'My Form',
  //     version: '1.0.0',
  //     component: MyForm
  //   },
  //   {
  //     type: 'my-dialog',
  //     name: 'My Dialog',
  //     version: '1.0.0',
  //     component: MyDialog,
  //     consumers: [{
  //       capabilityName: 'dialog-manager'
  //     }]
  //   }
  // ], manager)
}