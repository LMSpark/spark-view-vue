import type { AiBrowserLlmClient, AiBrowserLlmGenerateRequest, AiBrowserLlmGenerateResponse } from '../contracts/llm-contracts'

// ==============================================
// LLM 层：浏览器本地推理客户端（transformers.js）
// ==============================================
// 功能分区：
// 1) 使用 @huggingface/transformers 在浏览器内直接推理，无需服务器。
// 2) 运行时动态 import，让不使用本地推理的打包路径零代价。
// 3) 支持 WASM（CPU fallback）和 WebGPU 两种后端。
// 4) 实现与 browser-fetch-llm-client 完全相同的 AiBrowserLlmClient 接口。
//
// 时序分区：
// 1) 首次调用 generate 时懒加载模型（冷启动慢，后续复用同一 pipeline）。
// 2) 将多轮消息拼为 chat template 格式后送入模型。
// 3) 取最后一条 assistant 生成内容返回给 planner。
//
// 依赖说明：
// @huggingface/transformers 为 peerDependency，使用方按需安装：
//   pnpm add @huggingface/transformers
// 推荐小模型（浏览器可用）：
//   Qwen/Qwen2.5-0.5B-Instruct（<1 GB）
//   microsoft/Phi-3-mini-4k-instruct-onnx-web（需 WebGPU）
//   HuggingFaceTB/SmolLM2-135M-Instruct（极速，~270 MB）

// ----------------------------------------------
// 类型：transformers.js 动态导入的最小鸭子类型
// ----------------------------------------------

interface TransformersTextGenerationOutput {
  generated_text: string | Array<{ role: string; content: string }>
}

interface TransformersPipeline {
  (
    messages: Array<{ role: string; content: string }>,

    options?: {
      max_new_tokens?: number
      temperature?: number
      do_sample?: boolean
      return_full_text?: boolean
    }
  ): Promise<TransformersTextGenerationOutput | TransformersTextGenerationOutput[]>
}

interface TransformersModule {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<TransformersPipeline>
}

// ----------------------------------------------
// 选项
// ----------------------------------------------

export interface BrowserLocalLlmClientOptions {
  /** HuggingFace Hub 模型 ID，例如 "Qwen/Qwen2.5-0.5B-Instruct" */
  model: string
  /** 推理后端，默认 'wasm'（CPU 通用），支持 'webgpu'（需要现代浏览器） */
  device?: 'wasm' | 'webgpu'
  /** 单次最大生成 token 数，默认 512 */
  maxNewTokens?: number
  /** 默认温度，默认 0.6 */
  defaultTemperature?: number
  /** 进度回调，可用于显示模型下载进度（0~1） */
  onProgress?: (info: { progress: number; file: string }) => void
}

// ----------------------------------------------
// 内部工具函数
// ----------------------------------------------

/** 把多轮消息的最后一条 assistant 生成内容提取为字符串 */
function extractAssistantText(output: TransformersTextGenerationOutput | TransformersTextGenerationOutput[]): string {
  const single = Array.isArray(output) ? output[0] : output
  if (!single) return ''

  const generated = single.generated_text
  if (typeof generated === 'string') return generated

  if (Array.isArray(generated)) {
    // chat template 模式：generated_text 是消息数组，取最后一条 assistant
    for (let i = generated.length - 1; i >= 0; i--) {
      const msg = generated[i]
      if (msg?.role === 'assistant' && typeof msg.content === 'string') {
        return msg.content
      }
    }
  }

  return ''
}

// ----------------------------------------------
// 工厂函数
// ----------------------------------------------

/**
 * 创建浏览器本地推理 LLM 客户端。
 *
 * 模型在首次调用 generate 时懒加载，之后复用同一 pipeline 实例。
 * 不调用任何服务器 API，完全在浏览器 WASM/WebGPU 中运行。
 *
 * @example
 * const llm = createBrowserLocalLlmClient({
 *   model: 'HuggingFaceTB/SmolLM2-135M-Instruct',
 *   device: 'wasm',
 *   onProgress: ({ progress, file }) => console.log(file, `${(progress * 100).toFixed(0)}%`),
 * })
 * const result = await llm.generate({ messages: [{ role: 'user', content: 'hello' }] })
 * console.log(result.text)
 */
export function createBrowserLocalLlmClient(options: BrowserLocalLlmClientOptions): AiBrowserLlmClient {
  let pipelineInstance: TransformersPipeline | null = null

  async function loadPipeline(): Promise<TransformersPipeline> {
    if (pipelineInstance !== null) return pipelineInstance

    // 动态 import，不影响不使用本地推理的打包路径
    // @ts-expect-error — @huggingface/transformers 为可选 peerDependency，使用方按需安装
    const transformers = (await import('@huggingface/transformers')) as TransformersModule

    const pipelineOptions: Record<string, unknown> = {
      device: options.device ?? 'wasm',
    }

    if (options.onProgress !== undefined) {
      // transformers.js 的 progress_callback 签名
      pipelineOptions['progress_callback'] = (ev: { progress?: number; file?: string }) => {
        options.onProgress?.({
          progress: typeof ev.progress === 'number' ? ev.progress / 100 : 0,
          file: typeof ev.file === 'string' ? ev.file : '',
        })
      }
    }

    pipelineInstance = await transformers.pipeline('text-generation', options.model, pipelineOptions)
    return pipelineInstance
  }

  async function generate(request: AiBrowserLlmGenerateRequest): Promise<AiBrowserLlmGenerateResponse> {
    const pipe = await loadPipeline()

    const messages = request.messages.map((m) => ({ role: m.role, content: m.content }))
    const maxNewTokens = request.maxTokens ?? options.maxNewTokens ?? 512
    const temperature = request.temperature ?? options.defaultTemperature ?? 0.6

    const output = await pipe(messages, {
      max_new_tokens: maxNewTokens,
      temperature,
      do_sample: temperature > 0,
      return_full_text: false,
    })

    const text = extractAssistantText(output)
    return { text, raw: output }
  }

  return { generate }
}
