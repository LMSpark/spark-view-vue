import { Spark } from '../../../form-create-ssr-app/packages/spark-core/src/spark-namespace'

console.log('Spark exists:', !!Spark)
console.log('Spark.manager type:', typeof (Spark as any).manager)
console.log('Spark.capabilities type:', typeof (Spark as any).capabilities)
