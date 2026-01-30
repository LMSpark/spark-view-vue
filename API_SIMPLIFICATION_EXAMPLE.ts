// 示例：新的简化注册API

import { Spark } from '@spark-view/spark-core'
import MyComponent from './MyComponent.vue'

// 1. 注册单个Vue组件（自动从spark元数据读取）
Spark.register(MyComponent)

// 2. 注册多个组件
Spark.register([
  { type: 'button', component: MyComponent, version: '1.0.0' },
  { type: 'input', component: AnotherComponent, version: '1.0.0' }
])

// 3. 注册逻辑组件（没有实际Vue组件）
Spark.registerLogical({
  type: 'container',
  name: 'Container Component'
})

// 就是这么简单！不再需要记住多个不同的方法名。