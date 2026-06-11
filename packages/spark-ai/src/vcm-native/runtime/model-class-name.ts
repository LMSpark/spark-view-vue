import type { VcmNativeToolArgs } from './vcm-native-runtime'

/** 工具参数：优先 className，兼容遗留 kind（值均为 SparkAIModel 子类 className）。 */
export function readOptionalModelClassName(args: VcmNativeToolArgs): string | undefined {
  return optionalTrimmedString(args, 'className') ?? optionalTrimmedString(args, 'kind')
}

export function requireModelClassName(args: VcmNativeToolArgs): string {
  const className = readOptionalModelClassName(args)
  if (className === undefined) {
    throw new ModelClassNameArgsError('参数 "className" 缺失或非字符串。')
  }
  return className
}

export class ModelClassNameArgsError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ModelClassNameArgsError'
  }
}

function optionalTrimmedString(args: VcmNativeToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
