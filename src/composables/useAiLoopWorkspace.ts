import { computed, ref } from 'vue'
import { getAILoop, readPageFiles, type LogSnapshot, type PageFiles } from '@spark-view/spark-ai'

/**
 * AI 页面生成/迭代通用工作区：
 * - 统一管理 files/explanation/loading/logs 状态
 * - 统一封装 generate/iterate/readPageFiles/collector.peek
 */
export function useAiLoopWorkspace() {
  const files = ref<PageFiles>({})
  const explanation = ref('')
  const loading = ref(false)
  const logs = ref<LogSnapshot[]>([])

  const loop = computed(() => getAILoop())
  const sessionId = computed(() => loop.value?.sessionId ?? '(未初始化)')
  const hasFiles = computed(() => Object.keys(files.value).length > 0)

  async function generate(pageId: string, prompt: string): Promise<number> {
    if (!loop.value) {
      throw new Error('AI Loop 未初始化')
    }

    loading.value = true
    try {
      const response = await loop.value.generate(pageId, prompt)
      files.value = response.files
      explanation.value = response.explanation ?? ''
      return Object.keys(response.files).length
    } finally {
      loading.value = false
    }
  }

  async function iterate(pageId: string, feedback?: string): Promise<number> {
    if (!loop.value) {
      throw new Error('AI Loop 未初始化')
    }

    loading.value = true
    try {
      const response = await loop.value.iterate(pageId, feedback)
      files.value = response.files
      explanation.value = response.explanation ?? ''
      return Object.keys(response.files).length
    } finally {
      loading.value = false
    }
  }

  async function refreshFiles(pageId: string): Promise<void> {
    files.value = await readPageFiles(pageId)
  }

  function refreshLogs(pageId?: string): number {
    if (!loop.value) {
      logs.value = []
      return 0
    }

    logs.value = loop.value.collector.peek(pageId)
    return logs.value.length
  }

  return {
    loop,
    sessionId,
    files,
    explanation,
    loading,
    logs,
    hasFiles,
    generate,
    iterate,
    refreshFiles,
    refreshLogs,
  }
}
