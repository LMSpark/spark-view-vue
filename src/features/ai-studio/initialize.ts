/**
 * AI Studio 功能模块初始化
 *
 * 注册 ai-studio 组件到 SPARK 全局注册表
 */
import { Spark } from '@spark-view/spark-component'

export function initAiStudio(): void {
  Spark.register('ai-studio', () => import('./AiStudioPanel.vue'))
}
