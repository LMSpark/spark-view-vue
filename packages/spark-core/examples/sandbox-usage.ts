// 示例：新的简洁优雅的沙箱API
import { Spark } from '@spark-view/spark-core'

// 1. 直接执行表达式 - 直接返回结果，无需检查success字段
const result = Spark.run('1 + 2 * 3 + Math.pow(2, 3)')
console.log('Result:', result) // 15

// 2. 模板渲染 - 简洁直观
const message = Spark.renderTemplate('Hello {{name}}! You have {{count}} items.', {
  name: 'Alice',
  count: 5
})
console.log('Message:', message) // "Hello Alice! You have 5 items."

// 3. 代码验证 - 安全第一
try {
  Spark.validate('console.log("safe code")')
  console.log('Code is safe!')
} catch (error) {
  console.log('Unsafe code:', error.message)
}

// 4. 异步执行
async function asyncExample() {
  const asyncResult = await Spark.runAsync('Promise.resolve(42)')
  console.log('Async result:', asyncResult) // 42
}

// 5. 创建自定义沙箱实例
const customSandbox = Spark.sandbox({
  timeout: 2000,
  globals: { PI: Math.PI }
})

const piResult = customSandbox.run('PI * 2')
console.log('PI * 2 =', piResult) // 6.283185307179586

// 6. 复用求值器 - 性能优化
const calculator = customSandbox.createEvaluator('a + b * c')
console.log('1 + 2 * 3 =', calculator({ a: 1, b: 2, c: 3 })) // 7
console.log('4 + 5 * 6 =', calculator({ a: 4, b: 5, c: 6 })) // 34

// 7. 复用模板渲染器
const greeter = customSandbox.createRenderer('Welcome back, {{user}}!')
console.log(greeter({ user: 'John' })) // "Welcome back, John!"
console.log(greeter({ user: 'Jane' })) // "Welcome back, Jane!"