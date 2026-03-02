/**
 * Vitest 全局 setup —— 配置 DataView.wrapInstance 为 Vue reactive
 *
 * spark-data 本身无框架依赖，但根测试环境通过 Vue mounted 组件验证，
 * 因此需要在测试启动前配置 reactive 包装。
 */
import { reactive } from 'vue'
import { DataView } from '@spark-view/spark-data'

DataView.wrapInstance = (dv) => reactive(dv) as DataView
