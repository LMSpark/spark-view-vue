export type JsonSchemaPoolSchema = boolean | JsonSchemaPoolObject

export type JsonSchemaPoolObject = {
  readonly [keyword: string]: unknown
  readonly $ref?: string
  readonly $defs?: Readonly<Record<string, JsonSchemaPoolSchema>>
  readonly allOf?: readonly JsonSchemaPoolSchema[]}

export class JsonSchemaDefinitionPool<TSchema extends JsonSchemaPoolSchema = JsonSchemaPoolSchema> {
  private readonly definitions = new Map<string, TSchema>()
  private readonly expanding = new Set<string>()

  public refFor(identityKey: string): string {
    return `#/$defs/${jsonSchemaDefinitionName(identityKey)}`
  }

  public has(identityKey: string): boolean {
    return this.definitions.has(jsonSchemaDefinitionName(identityKey))
  }

  public isExpanding(identityKey: string): boolean {
    return this.expanding.has(jsonSchemaDefinitionName(identityKey))
  }

  public ensure(identityKey: string, createSchema: () => TSchema): void {
    const name = jsonSchemaDefinitionName(identityKey)
    if (this.definitions.has(name) || this.expanding.has(name)) return

    this.expanding.add(name)
    const schema = createSchema()
    this.expanding.delete(name)
    this.definitions.set(name, schema)
  }

  public attachToRoot(root: TSchema): TSchema | JsonSchemaPoolObject {
    if (this.definitions.size === 0) return root
    const $defs = this.sortedDefinitions()
    if (isJsonSchemaPoolObject(root)) {
      const rootObject: JsonSchemaPoolObject = root
      return {
        ...rootObject,
        $defs,
      }
    }
    return {
      allOf: [root],
      $defs,
    }
  }

  public sortedDefinitions(): Readonly<Record<string, TSchema>> {
    return Object.fromEntries([...this.definitions.entries()].sort(([left], [right]) => left.localeCompare(right)))
  }
}

export function jsonSchemaDefinitionName(identityKey: string): string {
  return identityKey.replace(/[^a-zA-Z0-9_.-]/gu, '_')
}

export function isJsonSchemaPoolObject(schema: JsonSchemaPoolSchema): schema is JsonSchemaPoolObject {
  return typeof schema === 'object'
}
