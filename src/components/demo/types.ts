/**
 * 演示组件的类型定义
 * 
 * 能力接口统一从 @spark-view/spark-utils 导入。
 * 此处仅定义 demo 特有的业务类型。
 */

/**
 * 用户数据类型（基于 JSON 配置动态定义）
 */
export interface User {
  id: number
  name: string
  age: number
  email: string
  role: string
}
