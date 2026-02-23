/**
 * @deprecated usePageDataSet 已迁移至 spark-component 渲染层。
 * 请从 '@spark-view/spark-component' 导入 usePageDataSet，
 * 或直接使用 usePageRenderer 返回的 dataSet ref。
 *
 * 迁移原因：此 composable 依赖 Vue（shallowRef / onUnmounted），
 * 违反了 spark-data 作为框架无关数据模型层的架构边界。
 */

export type {} // 空导出，防止 lint 报告「模块无导出」
