// Re-export error handling utilities from the canonical package to avoid duplication
export { handleError, withRetry, AppError, ErrorType, getUserFriendlyMessage } from '@spark-view/spark-core'