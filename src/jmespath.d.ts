declare module 'jmespath' {
  export type CompiledExpression = {
    search(data: unknown): unknown}

  export function compile(expression: string): CompiledExpression
  export function search(data: unknown, expression: string): unknown

  const jmespath: {
    compile: typeof compile
    search: typeof search
  }

  export default jmespath
}
