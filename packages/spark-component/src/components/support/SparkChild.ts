import SparkChild from './SparkChild.vue'
import { SPARK_CHILD_VNODE_MARKER } from './SparkChild.shared.js'

;(SparkChild as Record<string, unknown>)[SPARK_CHILD_VNODE_MARKER] = true

export default SparkChild
