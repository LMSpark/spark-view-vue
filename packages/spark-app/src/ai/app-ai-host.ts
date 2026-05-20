/**
 * App AI Center host composition.
 *
 * App 层只启动/承载 `@spark-view/spark-ai` 的 SSE transport。
 * 业务注册、业务状态与业务编排均不属于 App AI Center host。
 */

import {
  AiHostFetchTransport,
  uploadAiHostAttachment,
} from '@spark-view/spark-ai/host'
import type {
  AiHostAppendMessagesInput,
  AiHostFetchTransportOptions,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostUploadedAttachment,
} from '@spark-view/spark-ai/host'

export type AppAiHostOptions = {
  readonly transport?: AiHostTransport | undefined
  readonly transportOptions?: AiHostFetchTransportOptions | undefined
}

export type AppAiAttachmentUploadOptions = {
  readonly file: File
}

export class AppAiHost {
  readonly transport: AiHostTransport

  private readonly transportOptions: AiHostFetchTransportOptions

  constructor(options: AppAiHostOptions = {}) {
    this.transportOptions = options.transportOptions ?? {}
    this.transport = options.transport ?? new AiHostFetchTransport(this.transportOptions)
  }

  streamTurn(input: AiHostStreamTurnInput): Promise<AiHostStreamTurnResult> {
    return this.transport.streamTurn(input)
  }

  appendMessages(input: AiHostAppendMessagesInput): Promise<void> {
    return this.transport.appendMessages(input)
  }

  uploadAttachment(
    file: File,
    transportOptions: AiHostFetchTransportOptions = this.transportOptions,
  ): Promise<AiHostUploadedAttachment> {
    return uploadAiHostAttachment(file, transportOptions)
  }
}

export function createAppAiHost(options: AppAiHostOptions = {}): AppAiHost {
  return new AppAiHost(options)
}

export async function uploadAppAiAttachment(
  options: AppAiAttachmentUploadOptions,
  transportOptions: AiHostFetchTransportOptions = {},
): Promise<AiHostUploadedAttachment> {
  return uploadAiHostAttachment(options.file, transportOptions)
}