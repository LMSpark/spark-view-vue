/**
 * @module @spark-appworks/spark-app:page-ui/spark-component-page-bindings
 * 职责：提供应用壳层 spark-component-page-bindings 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 page-ui/spark-component-page-bindings。
 */
export type {
  PageBrowseFilesOptions,
  PageDialogOptions,
  PageDialogResult,
  PageSelectedFile,
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageServiceCapability,
  PageUploadedFile,
  PageUploadFilesOptions,
} from '@spark-appworks/spark-component'
