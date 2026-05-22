/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/attachment-upload.ts — 附件上传
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】AI 服务的附件上传工具函数。将浏览器 File 对象通过
 *   FormData 上传到 AI 后端，返回上传后的附件元数据。
 *
 * 【数据流】
 *   1. uploadAiHostAttachment(file, options)
 *   2. → POST {baseUrl}/upload（FormData，含 file 字段）
 *   3. → 解包 API 信封 → 校验 fileId
 *   4. → 返回 AiHostUploadedAttachment { fileId, name, size, mimeType }
 *
 * 【消费方】UI 层（文件上传组件）
 * ═══════════════════════════════════════════════════════════════
 */

import {
  assertOkResponse,
  isRecord,
  normalizeBaseUrl,
  readResponseJson,
  resolveFetch,
  unwrapApiEnvelope,
} from './http-utils'
import type {
  AiHostFetchTransportOptions,
  AiHostHeadersProvider,
  AiHostUploadedAttachment,
} from './transport-types'

/**
 * 上传附件到 AI 服务。
 *
 * @param file    — 浏览器 File 对象
 * @param options — 传输配置（baseUrl / fetch / getHeaders）
 * @returns 上传后的附件元数据
 */
export async function uploadAiHostAttachment(
  file: File,
  options: AiHostFetchTransportOptions = {},
): Promise<AiHostUploadedAttachment> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchClient = resolveFetch(options.fetch)
  const getHeaders: AiHostHeadersProvider = options.getHeaders ?? (() => ({}))

  // 构造 FormData（不上传额外 headers 如 Content-Type，由浏览器自动设置 boundary）
  const form = new FormData()
  form.append('file', file)

  const response = await fetchClient(`${baseUrl}/upload`, {
    method: 'POST',
    headers: await Promise.resolve(getHeaders()),
    body: form,
  })
  await assertOkResponse(response, 'AI attachment upload')

  // 解包信封并校验 fileId（必填）
  const body = unwrapApiEnvelope(await readResponseJson(response))
  if (!isRecord(body) || typeof body['fileId'] !== 'string' || body['fileId'].trim().length === 0) {
    throw new Error('AI upload response missing fileId')
  }

  // 返回规范化元数据（缺失字段回退到原始 File 属性）
  return {
    fileId: body['fileId'].trim(),
    name: typeof body['name'] === 'string' && body['name'].trim().length > 0 ? body['name'] : file.name,
    size: typeof body['size'] === 'number' && Number.isFinite(body['size']) ? body['size'] : file.size,
    mimeType: typeof body['mimeType'] === 'string' && body['mimeType'].trim().length > 0 ? body['mimeType'] : file.type,
  }
}
