import { exposeVcmNativeKnowledgeWorker } from '@spark-appworks/spark-ai/vcm-native'

// Worker 内只接收 metadata/catalog URL；大 JSON 由 Worker 自己 fetch 后缓存。
exposeVcmNativeKnowledgeWorker()
