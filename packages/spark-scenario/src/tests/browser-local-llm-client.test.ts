import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AiBrowserLlmGenerateRequest } from '../contracts/llm-contracts'

// ==============================================
// 测试：browser-local-llm-client
// ==============================================
// 功能分区：
// 1) mock @huggingface/transformers 动态 import，不依赖真实模型。
// 2) 验证 pipeline 懒加载与复用。
// 3) 验证参数透传（maxNewTokens / temperature / do_sample）。
// 4) 验证 generated_text 三种输出格式的文本提取。
// 5) 验证 onProgress 回调规范化（progress 0-1 映射）。
// 6) 验证 pipeline 调用失败时错误向上传播。
//
// 时序分区：
// 1) vi.mock 在模块加载前注册 transformers 桩。
// 2) 每用例通过 makePipeline 构造独立 pipeline mock。
// 3) createBrowserLocalLlmClient 拿到桩后调用 generate。
// 4) 断言调用参数和返回文本。

// ----------------------------------------------
// 全局 mock：拦截 @huggingface/transformers 动态 import
// ----------------------------------------------

// pipeline 工厂桩，由各用例通过 setPipelineFactory 替换
let currentPipelineFactory: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown> = () => {
  throw new Error('pipeline factory not set')
}

vi.mock('@huggingface/transformers', () => ({
  pipeline: (task: string, model: string, opts?: Record<string, unknown>) =>
    currentPipelineFactory(task, model, opts),
}))

// 注入各测试的 pipeline 实现
function setPipelineFactory(fn: typeof currentPipelineFactory): void {
  currentPipelineFactory = fn
}

// ----------------------------------------------
// 辅助：构造最小合规 pipeline
// ----------------------------------------------

type PipelineOutput =
  | { generated_text: string }
  | { generated_text: Array<{ role: string; content: string }> }
  | Array<{ generated_text: string }>
  | Array<{ generated_text: Array<{ role: string; content: string }> }>

function makePipeline(returnValue: PipelineOutput) {
  return vi.fn().mockResolvedValue(returnValue)
}

// ----------------------------------------------
// 测试套件
// ----------------------------------------------

describe('browser-local-llm-client', () => {
  // 每个用例重置 pipeline 工厂，避免串扰
  beforeEach(() => {
    setPipelineFactory(() => { throw new Error('pipeline factory not set') })
  })

  // ────────────────────────────────────────
  // 分组 1：generated_text 输出格式适配
  // ────────────────────────────────────────

  describe('extractAssistantText — generated_text 格式', () => {
    it('字符串格式：直接返回生成文本', async () => {
      // 有的旧版 transformers.js 直接返回字符串
      const pipe = makePipeline({ generated_text: 'hello world' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'hi' }] })
      expect(result.text).toBe('hello world')
    })

    it('chat-template 数组格式：提取最后一条 assistant 消息', async () => {
      // chat template 模式：generated_text 是完整消息数组，末尾是 assistant 回复
      const pipe = makePipeline({
        generated_text: [
          { role: 'system', content: 'you are helpful' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello from model' },
        ],
      })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'hi' }] })
      expect(result.text).toBe('hello from model')
    })

    it('chat-template 数组格式：多条 assistant 取最后一条', async () => {
      const pipe = makePipeline({
        generated_text: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'answer1' },
          { role: 'user', content: 'q2' },
          { role: 'assistant', content: 'answer2' },
        ],
      })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'q2' }] })
      expect(result.text).toBe('answer2')
    })

    it('数组格式但无 assistant 消息：返回空字符串', async () => {
      const pipe = makePipeline({
        generated_text: [{ role: 'user', content: 'only user' }],
      })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'hi' }] })
      expect(result.text).toBe('')
    })

    it('pipeline 返回数组包装（Array<output>）：提取第一项文本', async () => {
      // 某些版本 batch output 是数组
      const pipe = makePipeline([{ generated_text: 'batch result' }])
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'hi' }] })
      expect(result.text).toBe('batch result')
    })

    it('raw 字段保留原始 pipeline 输出', async () => {
      const rawOutput = { generated_text: 'raw test' }
      const pipe = makePipeline(rawOutput)
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const result = await client.generate({ messages: [{ role: 'user', content: 'hi' }] })
      expect(result.raw).toBe(rawOutput)
    })
  })

  // ────────────────────────────────────────
  // 分组 2：pipeline 参数透传
  // ────────────────────────────────────────

  describe('pipeline 参数透传', () => {
    it('默认 maxNewTokens=512, temperature=0.6, do_sample=true', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      expect(pipe).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hi' }],
        expect.objectContaining({
          max_new_tokens: 512,
          temperature: 0.6,
          do_sample: true,
          return_full_text: false,
        }),
      )
    })

    it('options 覆盖默认 maxNewTokens / temperature', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({
        model: 'test-model',
        maxNewTokens: 128,
        defaultTemperature: 0.1,
      })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      expect(pipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ max_new_tokens: 128, temperature: 0.1 }),
      )
    })

    it('request 字段优先于 options 默认值', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model', maxNewTokens: 256, defaultTemperature: 0.5 })

      const req: AiBrowserLlmGenerateRequest = {
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 64,
        temperature: 0,
      }
      await client.generate(req)

      expect(pipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          max_new_tokens: 64,
          temperature: 0,
          do_sample: false, // temperature=0 → do_sample=false
        }),
      )
    })

    it('temperature=0 时 do_sample=false', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model', defaultTemperature: 0 })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      expect(pipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ do_sample: false }),
      )
    })

    it('消息数组完整透传到 pipeline', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      const messages = [
        { role: 'system' as const, content: 'system prompt' },
        { role: 'user' as const, content: 'first question' },
        { role: 'assistant' as const, content: 'first answer' },
        { role: 'user' as const, content: 'second question' },
      ]
      await client.generate({ messages })

      expect(pipe).toHaveBeenCalledWith(
        messages.map((m) => ({ role: m.role, content: m.content })),
        expect.anything(),
      )
    })
  })

  // ────────────────────────────────────────
  // 分组 3：pipeline 懒加载与复用
  // ────────────────────────────────────────

  describe('pipeline 懒加载与复用', () => {
    it('pipeline 工厂仅被调用一次，多次 generate 复用同一实例', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      const pipelineFactory = vi.fn().mockResolvedValue(pipe)
      setPipelineFactory(pipelineFactory)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      await client.generate({ messages: [{ role: 'user', content: 'q1' }] })
      await client.generate({ messages: [{ role: 'user', content: 'q2' }] })
      await client.generate({ messages: [{ role: 'user', content: 'q3' }] })

      // pipeline 工厂只初始化一次
      expect(pipelineFactory).toHaveBeenCalledTimes(1)
      // pipeline 本体被调用三次
      expect(pipe).toHaveBeenCalledTimes(3)
    })

    it('pipeline 工厂收到正确的 task、model、device 参数', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      const pipelineFactory = vi.fn().mockResolvedValue(pipe)
      setPipelineFactory(pipelineFactory)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'Qwen/Qwen2.5-0.5B-Instruct', device: 'webgpu' })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      expect(pipelineFactory).toHaveBeenCalledWith(
        'text-generation',
        'Qwen/Qwen2.5-0.5B-Instruct',
        expect.objectContaining({ device: 'webgpu' }),
      )
    })

    it('device 未指定时默认为 wasm', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      const pipelineFactory = vi.fn().mockResolvedValue(pipe)
      setPipelineFactory(pipelineFactory)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      expect(pipelineFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ device: 'wasm' }),
      )
    })
  })

  // ────────────────────────────────────────
  // 分组 4：onProgress 进度回调
  // ────────────────────────────────────────

  describe('onProgress 回调', () => {
    it('有 onProgress 时 pipeline 工厂收到 progress_callback', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      const pipelineFactory = vi.fn().mockResolvedValue(pipe)
      setPipelineFactory(pipelineFactory)

      const onProgress = vi.fn()
      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model', onProgress })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      const opts = pipelineFactory.mock.calls[0]?.[2] as Record<string, unknown>
      expect(typeof opts['progress_callback']).toBe('function')
    })

    it('progress_callback 将原始 progress(0-100) 归一化为 0-1', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      let capturedCallback: ((ev: Record<string, unknown>) => void) | null = null

      const pipelineFactory = vi.fn().mockImplementation(
        async (_task: unknown, _model: unknown, opts: Record<string, unknown>) => {
          capturedCallback = opts['progress_callback'] as (ev: Record<string, unknown>) => void
          return pipe
        },
      )
      setPipelineFactory(pipelineFactory)

      const onProgress = vi.fn()
      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model', onProgress })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      // 模拟 transformers.js 触发进度事件
      capturedCallback?.({ progress: 50, file: 'model.onnx' })

      expect(onProgress).toHaveBeenCalledWith({ progress: 0.5, file: 'model.onnx' })
    })

    it('progress/file 缺失时安全兜底（progress=0, file=""）', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      let capturedCallback: ((ev: Record<string, unknown>) => void) | null = null

      const pipelineFactory = vi.fn().mockImplementation(
        async (_task: unknown, _model: unknown, opts: Record<string, unknown>) => {
          capturedCallback = opts['progress_callback'] as (ev: Record<string, unknown>) => void
          return pipe
        },
      )
      setPipelineFactory(pipelineFactory)

      const onProgress = vi.fn()
      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model', onProgress })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      // 空事件
      capturedCallback?.({})

      expect(onProgress).toHaveBeenCalledWith({ progress: 0, file: '' })
    })

    it('无 onProgress 时 pipeline 工厂选项中不含 progress_callback', async () => {
      const pipe = makePipeline({ generated_text: 'ok' })
      const pipelineFactory = vi.fn().mockResolvedValue(pipe)
      setPipelineFactory(pipelineFactory)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      await client.generate({ messages: [{ role: 'user', content: 'hi' }] })

      const opts = pipelineFactory.mock.calls[0]?.[2] as Record<string, unknown>
      expect(opts['progress_callback']).toBeUndefined()
    })
  })

  // ────────────────────────────────────────
  // 分组 5：错误传播
  // ────────────────────────────────────────

  describe('错误传播', () => {
    it('pipeline 工厂抛出时 generate 向上传播错误', async () => {
      setPipelineFactory(async () => {
        throw new Error('model load failed')
      })

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'bad-model' })

      await expect(client.generate({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('model load failed')
    })

    it('pipeline 推理抛出时 generate 向上传播错误', async () => {
      const pipe = vi.fn().mockRejectedValue(new Error('inference failed'))
      setPipelineFactory(async () => pipe)

      const { createBrowserLocalLlmClient } = await import('../llm/browser-local-llm-client')
      const client = createBrowserLocalLlmClient({ model: 'test-model' })

      await expect(client.generate({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('inference failed')
    })
  })
})
