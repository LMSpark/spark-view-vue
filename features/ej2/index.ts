// features/ej2/index.ts
// EJ2组件系统入口文件

// 导出组件
export { default as GridComponent } from './components/GridComponent.vue'
export { default as ColumnComponent } from './components/ColumnComponent.vue'

// 向后兼容：RendererComponent 已废弃，使用 SparkComponentRenderer 代替
// import SparkComponentRenderer from '../spark/components/SparkComponentRenderer.vue'
// export { SparkComponentRenderer as RendererComponent }