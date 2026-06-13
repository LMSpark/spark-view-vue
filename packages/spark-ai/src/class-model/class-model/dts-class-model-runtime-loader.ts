/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-class-model-runtime-loader
 * 职责：按 runtime manifest 动态加载最小 ClassModel shard，并沿构建期 links 扩展子模型闭包。
 * 边界：只消费 runtime JSON 协议，不解析 .d.ts、不扫描签名文本，也不生成 guide 文案。
 * AI用途：需要按需加载 AJV 参数 schema 与属性/参数/返回值子模型链时，用本模块作为运行时入口。
 */
import type {
  DtsClassModelRuntimeAttribute,
  DtsClassModelRuntimeLink,
  DtsClassModelRuntimeManifest,
  DtsClassModelRuntimeMethod,
  DtsClassModelRuntimeModel,
  DtsClassModelRuntimeRef,
  DtsClassModelRuntimeSchemaRef,
  DtsClassModelRuntimeShard,
} from './dts-bundle-types'
import { resolveDtsBundleRelativeUrl } from './dts-bundle-url'
import {
  readDtsClassModelRuntimeManifest,
  readDtsClassModelRuntimeShard,
} from './read-dts-class-model-bundle-json'

/** Dts Class Model Runtime Loader Options 的调用配置。 */
export type DtsClassModelRuntimeLoaderOptions = Readonly<{
  manifestUrl: string
  fetchJson?: (url: string) => Promise<unknown>
}>

type RuntimeQueueItem = Readonly<{
  className: string
  file?: string
}>

/** Dts Class Model Runtime Schema Closure 的语义模型。 */
export type DtsClassModelRuntimeSchemaClosure = Readonly<{
  rootRef: string
  schemas: readonly DtsClassModelRuntimeSchemaRef[]
  schemaByRef: Readonly<Record<string, DtsClassModelRuntimeSchemaRef>>
}>

/** Dts Class Model Runtime Method Contract Query 的查询条件。 */
export type DtsClassModelRuntimeMethodContractQuery = Readonly<{
  className: string
  methodName: string
  overloadIndex?: number
}>

/** Dts Class Model Runtime Attribute Contract Query 的查询条件。 */
export type DtsClassModelRuntimeAttributeContractQuery = Readonly<{
  className: string
  attributeName: string
  attributeIndex?: number
}>

/** Dts Class Model Runtime Method Contract 的运行时调用合同。 */
export type DtsClassModelRuntimeMethodContract = Readonly<{
  model: DtsClassModelRuntimeModel
  method: DtsClassModelRuntimeMethod
  paramsSchema: DtsClassModelRuntimeSchemaRef
  paramsSchemaClosure: DtsClassModelRuntimeSchemaClosure
  returnSchema?: DtsClassModelRuntimeSchemaRef
  returnSchemaClosure?: DtsClassModelRuntimeSchemaClosure
  parameterLinks: readonly DtsClassModelRuntimeLink[]
  returnLinks: readonly DtsClassModelRuntimeLink[]
  targetModels: readonly DtsClassModelRuntimeModel[]
}>

/** Dts Class Model Runtime Attribute Contract 的运行时属性合同。 */
export type DtsClassModelRuntimeAttributeContract = Readonly<{
  model: DtsClassModelRuntimeModel
  attribute: DtsClassModelRuntimeAttribute
  valueSchema: DtsClassModelRuntimeSchemaRef
  valueSchemaClosure: DtsClassModelRuntimeSchemaClosure
  attributeLinks: readonly DtsClassModelRuntimeLink[]
  targetModels: readonly DtsClassModelRuntimeModel[]
}>

/** Dts Class Model Runtime Loader 的语义模型。 */
export class DtsClassModelRuntimeLoader {
  private manifestPromise?: Promise<DtsClassModelRuntimeManifest>
  private readonly filePromises = new Map<string, Promise<DtsClassModelRuntimeShard>>()
  private readonly loadedRefs = new Map<string, DtsClassModelRuntimeRef>()
  private readonly loadedModels = new Map<string, DtsClassModelRuntimeModel>()
  private readonly fetchJson: (url: string) => Promise<unknown>

  /** 创建 Dts Class Model Runtime Loader 实例。 */
  public constructor(private readonly options: DtsClassModelRuntimeLoaderOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

  /** 初始化并返回 runtime manifest。 */
  public async init(): Promise<DtsClassModelRuntimeManifest> {
    return await this.loadManifest()
  }

  /** 按 className 加载单个 runtime model。 */
  public async ensureClassName(className: string): Promise<DtsClassModelRuntimeModel> {
    return await this.ensureRuntimeModel({ className })
  }

  /** 按统一 @refs id 加载 ref；跨文件 ref 可由 manifest 或显式 file 定位。 */
  public async ensureRef(ref: string, file?: string): Promise<DtsClassModelRuntimeRef> {
    const cached = this.loadedRefs.get(ref)
    if (cached !== undefined) return cached

    if (file !== undefined) {
      await this.ensureFile(file)
      const loaded = this.loadedRefs.get(ref)
      if (loaded !== undefined) return loaded
    }

    const manifest = await this.loadManifest()
    const indexEntry = manifest.refIndex[ref]
    if (indexEntry === undefined) {
      throw new Error(`DTS class-model runtime bundle cannot locate ref "${ref}".`)
    }
    await this.ensureFile(indexEntry.file)
    const loaded = this.loadedRefs.get(ref)
    if (loaded === undefined) {
      throw new Error(`DTS class-model runtime shard did not provide ref "${ref}".`)
    }
    return loaded
  }

  /** 按统一 @refs id 加载 schema ref，并校验 ref 类型。 */
  public async ensureSchema(ref: string, file?: string): Promise<DtsClassModelRuntimeSchemaRef> {
    const entry = await this.ensureRef(ref, file)
    if (entry.kind !== 'schema') {
      throw new Error(`DTS class-model runtime ref "${ref}" is not a schema.`)
    }
    return entry
  }

  /** 加载 root schema 及其 runtime $ref 依赖，返回可注册给 AJV 的 schema 闭包。 */
  public async ensureSchemaClosure(rootSchemaRef: string, file?: string): Promise<DtsClassModelRuntimeSchemaClosure> {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const schemas: DtsClassModelRuntimeSchemaRef[] = []
    const schemaByRef: Record<string, DtsClassModelRuntimeSchemaRef> = {}

    const visitSchema = async (schemaRef: string, schemaFile?: string): Promise<void> => {
      if (visited.has(schemaRef)) return
      if (visiting.has(schemaRef)) return

      visiting.add(schemaRef)
      const schemaNode = await this.ensureSchema(schemaRef, schemaFile)
      for (const childRef of collectRuntimeSchemaRefs(schemaNode.schema)) {
        await visitSchema(childRef)
      }
      visiting.delete(schemaRef)
      visited.add(schemaRef)
      schemas.push(schemaNode)
      schemaByRef[schemaRef] = schemaNode
    }

    await visitSchema(rootSchemaRef, file)
    return {
      rootRef: rootSchemaRef,
      schemas,
      schemaByRef,
    }
  }

  /** 沿构建期 links 加载 root 可达子模型闭包。 */
  public async ensureReachableClosure(rootClassName: string): Promise<readonly string[]> {
    const visited = new Set<string>()
    const reachable: string[] = []
    const queue: RuntimeQueueItem[] = [{ className: rootClassName }]
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined || visited.has(item.className)) continue
      const model = await this.ensureRuntimeModel(item)
      visited.add(item.className)
      reachable.push(item.className)
      for (const linkRef of model.linkRefs) {
        const link = await this.ensureRuntimeLink(linkRef, item.file)
        if (!visited.has(link.targetClassName)) {
          queue.push({ className: link.targetClassName, file: link.targetFile })
        }
      }
    }
    return reachable
  }

  /** 加载 method 调用合同：method ref、参数 schema closure、返回 schema closure 与子模型 links。 */
  public async ensureMethodContract(
    query: DtsClassModelRuntimeMethodContractQuery,
  ): Promise<DtsClassModelRuntimeMethodContract> {
    const { model, file } = await this.ensureRuntimeModelWithFile(query.className)
    const methods = await Promise.all(model.methodRefs.map(ref => this.ensureRuntimeMethod(ref, file)))
    const matchingMethods = methods.filter(method => method.name === query.methodName)
    const method = selectNamedRuntimeRef({
      refs: matchingMethods,
      refName: query.methodName,
      index: query.overloadIndex,
      kind: 'method',
      ownerClassName: query.className,
    })

    const paramsSchema = await this.ensureSchema(method.paramsSchemaRef, file)
    const paramsSchemaClosure = await this.ensureSchemaClosure(method.paramsSchemaRef, file)
    const returnSchema = method.returnSchemaRef === undefined
      ? undefined
      : await this.ensureSchema(method.returnSchemaRef, file)
    const returnSchemaClosure = method.returnSchemaRef === undefined
      ? undefined
      : await this.ensureSchemaClosure(method.returnSchemaRef, file)
    const methodLinks = await this.ensureRuntimeLinksFromModel(model, file, method.ref)
    const parameterLinks = methodLinks.filter(link => link.relation === 'method-parameter')
    const returnLinks = methodLinks.filter(link => link.relation === 'method-return')
    const targetModels = await this.ensureRuntimeLinkTargetModels(methodLinks)

    return {
      model,
      method,
      paramsSchema,
      paramsSchemaClosure,
      ...(returnSchema === undefined ? {} : { returnSchema }),
      ...(returnSchemaClosure === undefined ? {} : { returnSchemaClosure }),
      parameterLinks,
      returnLinks,
      targetModels,
    }
  }

  /** 加载 attribute 读取合同：attribute ref、值 schema closure 与属性子模型 links。 */
  public async ensureAttributeContract(
    query: DtsClassModelRuntimeAttributeContractQuery,
  ): Promise<DtsClassModelRuntimeAttributeContract> {
    const { model, file } = await this.ensureRuntimeModelWithFile(query.className)
    const attributes = await Promise.all(model.attributeRefs.map(ref => this.ensureRuntimeAttribute(ref, file)))
    const matchingAttributes = attributes.filter(attribute => attribute.name === query.attributeName)
    const attribute = selectNamedRuntimeRef({
      refs: matchingAttributes,
      refName: query.attributeName,
      index: query.attributeIndex,
      kind: 'attribute',
      ownerClassName: query.className,
    })

    const valueSchema = await this.ensureSchema(attribute.schemaRef, file)
    const valueSchemaClosure = await this.ensureSchemaClosure(attribute.schemaRef, file)
    const attributeLinks = await this.ensureRuntimeLinksFromModel(model, file, attribute.ref)
    const targetModels = await this.ensureRuntimeLinkTargetModels(attributeLinks)

    return {
      model,
      attribute,
      valueSchema,
      valueSchemaClosure,
      attributeLinks,
      targetModels,
    }
  }

  /** 返回已加载的 runtime model map。 */
  public buildLoadedModels(): Readonly<Record<string, DtsClassModelRuntimeModel>> {
    const models: Record<string, DtsClassModelRuntimeModel> = {}
    for (const [className, model] of this.loadedModels.entries()) models[className] = model
    return models
  }

  private async ensureRuntimeModel(item: RuntimeQueueItem): Promise<DtsClassModelRuntimeModel> {
    const cached = this.loadedModels.get(item.className)
    if (cached !== undefined) return cached

    if (item.file !== undefined) {
      await this.ensureFile(item.file)
      const linked = this.loadedModels.get(item.className)
      if (linked !== undefined) return linked
    }

    const manifest = await this.loadManifest()
    const entry = manifest.classIndex[item.className]
    if (entry === undefined) {
      throw new Error(`DTS class-model runtime bundle has no className "${item.className}".`)
    }
    await this.ensureFile(entry.file)
    const ref = this.loadedRefs.get(entry.modelRef)
    if (ref === undefined || ref.kind !== 'model') {
      throw new Error(`DTS class-model runtime shard did not provide className "${item.className}".`)
    }
    return ref
  }

  private async ensureRuntimeModelWithFile(
    className: string,
  ): Promise<Readonly<{ model: DtsClassModelRuntimeModel; file: string }>> {
    const manifest = await this.loadManifest()
    const entry = manifest.classIndex[className]
    if (entry === undefined) {
      throw new Error(`DTS class-model runtime bundle has no className "${className}".`)
    }
    return {
      model: await this.ensureRuntimeModel({ className, file: entry.file }),
      file: entry.file,
    }
  }

  private async ensureFile(file: string): Promise<DtsClassModelRuntimeShard> {
    const existing = this.filePromises.get(file)
    if (existing !== undefined) return await existing

    const promise = this.loadFile(resolveDtsBundleRelativeUrl(this.options.manifestUrl, file))
    this.filePromises.set(file, promise)
    const shard = await promise
    for (const [ref, entry] of Object.entries(shard['@refs'])) {
      if (!this.loadedRefs.has(ref)) this.loadedRefs.set(ref, entry)
      if (entry.kind === 'model' && !this.loadedModels.has(entry.className)) {
        this.loadedModels.set(entry.className, entry)
      }
    }
    return shard
  }

  private async ensureRuntimeAttribute(ref: string, file: string | undefined): Promise<DtsClassModelRuntimeAttribute> {
    const entry = await this.ensureRef(ref, file)
    if (entry.kind !== 'attribute') {
      throw new Error(`DTS class-model runtime ref "${ref}" is not an attribute.`)
    }
    return entry
  }

  private async ensureRuntimeMethod(ref: string, file: string | undefined): Promise<DtsClassModelRuntimeMethod> {
    const entry = await this.ensureRef(ref, file)
    if (entry.kind !== 'method') {
      throw new Error(`DTS class-model runtime ref "${ref}" is not a method.`)
    }
    return entry
  }

  private async ensureRuntimeLink(ref: string, file: string | undefined): Promise<DtsClassModelRuntimeLink> {
    const entry = await this.ensureRef(ref, file)
    if (entry.kind !== 'link') {
      throw new Error(`DTS class-model runtime ref "${ref}" is not a link.`)
    }
    return entry
  }

  private async ensureRuntimeLinksFromModel(
    model: DtsClassModelRuntimeModel,
    file: string,
    fromRef: string,
  ): Promise<readonly DtsClassModelRuntimeLink[]> {
    const links = await Promise.all(model.linkRefs.map(ref => this.ensureRuntimeLink(ref, file)))
    return links.filter(link => link.fromRef === fromRef)
  }

  private async ensureRuntimeLinkTargetModels(
    links: readonly DtsClassModelRuntimeLink[],
  ): Promise<readonly DtsClassModelRuntimeModel[]> {
    const models: DtsClassModelRuntimeModel[] = []
    const visited = new Set<string>()
    for (const link of links) {
      if (visited.has(link.targetClassName)) continue
      visited.add(link.targetClassName)
      models.push(await this.ensureRuntimeModel({
        className: link.targetClassName,
        file: link.targetFile,
      }))
    }
    return models
  }

  private async loadManifest(): Promise<DtsClassModelRuntimeManifest> {
    this.manifestPromise ??= this.fetchJson(this.options.manifestUrl).then(readDtsClassModelRuntimeManifest)
    return await this.manifestPromise
  }

  private async loadFile(url: string): Promise<DtsClassModelRuntimeShard> {
    return readDtsClassModelRuntimeShard(await this.fetchJson(url))
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load DTS class-model runtime JSON: ${url} ${String(response.status)}`)
  }
  return await response.json()
}

function collectRuntimeSchemaRefs(schema: unknown): readonly string[] {
  const refs = new Set<string>()
  collectRuntimeSchemaRefsInto(schema, refs)
  return [...refs]
}

function collectRuntimeSchemaRefsInto(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRuntimeSchemaRefsInto(item, refs)
    return
  }
  if (value === null || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  const ref = record['$ref']
  if (typeof ref === 'string' && isRuntimeSchemaRef(ref)) refs.add(ref)
  for (const child of Object.values(record)) collectRuntimeSchemaRefsInto(child, refs)
}

function isRuntimeSchemaRef(ref: string): boolean {
  return ref.startsWith('spark-class-model://schema/')
}

function selectNamedRuntimeRef<TRef extends Readonly<{ ref: string }>>(command: {
  refs: readonly TRef[]
  refName: string
  index: number | undefined
  kind: string
  ownerClassName: string
}): TRef {
  const { refs, refName, index, kind, ownerClassName } = command
  if (index !== undefined) {
    const entry = refs[index]
    if (entry === undefined) {
      throw new Error(`DTS class-model runtime ${kind} "${ownerClassName}.${refName}" has no overload/index ${String(index)}.`)
    }
    return entry
  }
  if (refs.length === 0) {
    throw new Error(`DTS class-model runtime ${kind} "${ownerClassName}.${refName}" was not found.`)
  }
  if (refs.length > 1) {
    throw new Error(`DTS class-model runtime ${kind} "${ownerClassName}.${refName}" is ambiguous; pass an explicit index.`)
  }
  const entry = refs[0]
  if (entry === undefined) {
    throw new Error(`DTS class-model runtime ${kind} "${ownerClassName}.${refName}" was not found.`)
  }
  return entry
}
