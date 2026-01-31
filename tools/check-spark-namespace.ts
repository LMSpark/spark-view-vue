import { Spark } from '../../../form-create-ssr-app/packages/spark-core/src/spark-namespace'

console.info('Spark exists:', !!Spark)
console.info('Spark.manager type:', typeof (Spark as Record<string, unknown>).manager)
console.info('Spark.capabilities type:', typeof (Spark as Record<string, unknown>).capabilities)
