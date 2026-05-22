/**
 * AI service attachment upload.
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

export async function uploadAiHostAttachment(
  file: File,
  options: AiHostFetchTransportOptions = {},
): Promise<AiHostUploadedAttachment> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchClient = resolveFetch(options.fetch)
  const getHeaders: AiHostHeadersProvider = options.getHeaders ?? (() => ({}))
  const form = new FormData()
  form.append('file', file)

  const response = await fetchClient(`${baseUrl}/upload`, {
    method: 'POST',
    headers: await Promise.resolve(getHeaders()),
    body: form,
  })
  await assertOkResponse(response, 'AI attachment upload')
  const body = unwrapApiEnvelope(await readResponseJson(response))
  if (!isRecord(body) || typeof body['fileId'] !== 'string' || body['fileId'].trim().length === 0) {
    throw new Error('AI upload response missing fileId')
  }
  return {
    fileId: body['fileId'].trim(),
    name: typeof body['name'] === 'string' && body['name'].trim().length > 0 ? body['name'] : file.name,
    size: typeof body['size'] === 'number' && Number.isFinite(body['size']) ? body['size'] : file.size,
    mimeType: typeof body['mimeType'] === 'string' && body['mimeType'].trim().length > 0 ? body['mimeType'] : file.type,
  }
}
