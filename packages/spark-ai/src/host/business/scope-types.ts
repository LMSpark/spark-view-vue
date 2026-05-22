import type {
  AiHostMessageRole,
  AiHostMessageSource,
} from '../session/session-types'

export class AiHostBusinessTarget {
  public constructor(
    public readonly businessRegistrationId: string,
    public readonly businessInstanceId: string,
  ) {}
}

export class AiHostBusinessScope extends AiHostBusinessTarget {
  public constructor(
    businessRegistrationId: string,
    businessInstanceId: string,
    public readonly instanceId: string,
    public readonly runtimeInstanceId: string,
  ) {
    super(businessRegistrationId, businessInstanceId)
  }
}

export class AiHostBusinessRuntimeContext {
  public constructor(
    public readonly moduleId: string,
    public readonly moduleInstanceId: string,
    public readonly instanceId: string,
  ) {}
}

export type AiHostBusinessAppendMessageOptions = AiHostBusinessRuntimeContext & Readonly<{
  role: AiHostMessageRole
  content: string
  source?: AiHostMessageSource | undefined
  metadata?: Record<string, unknown> | undefined
}>
