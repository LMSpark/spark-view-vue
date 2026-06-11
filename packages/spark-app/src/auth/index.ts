/**
 * @module @spark-appworks/spark-app:auth/index
 * 职责：提供 spark-app 应用壳中的 index 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 认证模块入口
 */

export { AuthService, createAuthService } from './AuthService'
export { TokenManager } from './TokenManager'
export type {
  AuthConfig,
  LoginCredentials,
  AuthResult,
  TokenStorage
} from './types'
