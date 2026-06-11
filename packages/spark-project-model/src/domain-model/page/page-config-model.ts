import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { PageContentLoader } from '../../io/page-content-loader'
import type { PageFileApi } from '../../io/page-file-api'
import type { PageContentLoadResult, PageNodeFileName } from '../../page/page-file'

/** PageConfigModel 构造参数。 */
export type PageConfigModelInitOptions = {
  /** 配置页 id，与导航节点 id 一致。 */
  pageId: string
  /** `rule.json` 原文；默认 `'[]'`。 */
  ruleJson?: string
  /** `pagedata.json` 原文；默认 `'{}'`。 */
  pageDataJson?: string
  /** `script.js` 原文。 */
  script?: string
  /** `style.css` 原文。 */
  style?: string
}

/** PageConfigModel.save 参数。 */
export type PageConfigModelSaveOptions = {
  /** Workspace 提供的页面文件写 API。 */
  api: PageFileApi
}

/**
 * 配置页四文件内存模型（项目域叶子层）。
 *
 * 公开字段对应磁盘四文件原文；编辑直接写字段，持久化走 `save` / `load`。
 * LLM 可见：字段 / 方法 / 本 JSDoc 由 VCM 直接投影，不另建 read 投影层。
 *
 * @vcmSession 四文件会话模型；恢复走 static load，持久化走 save({ api })。
 *
 * ## 字段 ↔ 文件
 *
 * | 字段 | 文件 |
 * |------|------|
 * | `ruleJson` | `rule.json` |
 * | `pageDataJson` | `pagedata.json` |
 * | `script` | `script.js` |
 * | `style` | `style.css` |
 *
 * `pageId` 与导航节点 id 一致，作为存储目录键。
 *
 * ## 编辑流程（AI / Vue 共用同一实例）
 *
 * 1. 读：`model.ruleJson` / `model.script` 等公开字段。
 * 2. 写：直接赋值，例如 `model.script = '...'`。
 * 3. 不落盘前变更只改内存；**结束编辑**前调用 `validate()`；持久化前 `save` 会自动校验。
 *
 * ## 保存流程 `save({ api })`
 *
 * 1. 调用方传入 `PageFileApi`（Workspace 持有，**不**挂在本模型公开字段上）。
 * 2. 本方法按字段顺序调用四次 `api.saveFileContent(pageId, filename, text)`：
 *    - 内部为 HTTP `PUT`，`Content-Type: text/plain`，路径 `{pagesFilesApi}/{pageId}/{filename}`。
 * 3. 任一次失败则 Promise reject；调用方负责重试或提示。
 *
 * ## 加载流程 `load({ pageId, loader })`
 *
 * 1. 调用方传入 `pageId` 与 `PageContentLoader`（读路径专用；写用 `PageFileApi`）。
 * 2. 并行四次 `loader.loadPageFileContent(pageId, filename)`（`parseJSON: false`，返回原文 string）。
 * 3. 组装为 `PageConfigModel` 实例挂到导航行的 `pageConfig`。
 *
 * ## 与上层关系
 *
 * - 父：`NavigationRowModel.pageConfig`（可空）。
 * - 新建页：先 `PageFileApi.createFiles` 建目录（Workspace 编排），再 `load` 或 `new PageConfigModel`。
 */
export class PageConfigModel extends SparkAIModel {
  /** 配置页 id，与导航节点 id 一致。 */
  pageId: string
  /** `rule.json` 原文。 */
  ruleJson: string
  /** `pagedata.json` 原文。 */
  pageDataJson: string
  /** `script.js` 原文。 */
  script: string
  /** `style.css` 原文。 */
  style: string

  /**
   * 创建四文件内存模型。
   *
   * @param options 四文件初始化参数。
   */
  constructor(options: PageConfigModelInitOptions) {
    super(options)
    this.pageId = options.pageId
    this.ruleJson = options.ruleJson ?? '[]'
    this.pageDataJson = options.pageDataJson ?? '{}'
    this.script = options.script ?? ''
    this.style = options.style ?? ''
  }

  toJson(): Record<string, unknown> {
    return {
      pageId: this.pageId,
      ruleJson: this.ruleJson,
      pageDataJson: this.pageDataJson,
      script: this.script,
      style: this.style,
    }
  }

  /** 结束编辑前校验：`pageId` 非空。 */
  validate(): void {
    if (this.pageId.trim().length === 0) {
      throw new Error('PageConfigModel.validate: missing pageId')
    }
  }

  /**
   * 将当前四文件字段写入远端存储。
   *
   * 依次 PUT `rule.json`、`pagedata.json`、`script.js`、`style.css`；
   * 具体 HTTP 由 `PageFileApi.saveFileContent` 完成。
   *
   * @param options 四文件写盘参数。
   */
  async save(options: PageConfigModelSaveOptions): Promise<void> {
    this.validate()
    const { api } = options
    await api.saveFileContent(this.pageId, 'rule.json', this.ruleJson)
    await api.saveFileContent(this.pageId, 'pagedata.json', this.pageDataJson)
    await api.saveFileContent(this.pageId, 'script.js', this.script)
    await api.saveFileContent(this.pageId, 'style.css', this.style)
  }

  /**
   * 从远端加载四文件并构造实例。
   *
   * 并行读取四文件原文；失败时 throw，不返回部分填充实例。
   *
   * @param options.pageId 配置页 id。
   * @param options.loader Workspace 提供的页面文件读加载器。
   */
  static async load(options: {
    pageId: string
    loader: PageContentLoader
  }): Promise<PageConfigModel> {
    const { pageId, loader } = options
    const [rule, pageData, script, style] = await Promise.all([
      loader.loadPageFileContent(pageId, 'rule.json'),
      loader.loadPageFileContent(pageId, 'pagedata.json'),
      loader.loadPageFileContent(pageId, 'script.js'),
      loader.loadPageFileContent(pageId, 'style.css'),
    ])

    return new PageConfigModel({
      pageId,
      ruleJson: readPageFileText(rule, 'rule.json'),
      pageDataJson: readPageFileText(pageData, 'pagedata.json'),
      script: readPageFileText(script, 'script.js'),
      style: readPageFileText(style, 'style.css'),
    })
  }
}

function readPageFileText(result: PageContentLoadResult<string>, filename: PageNodeFileName): string {
  if (result.success !== true || result.data === undefined) {
    throw new Error(
      `PageConfigModel.load: failed to load ${filename}: ${result.error ?? result.reason ?? 'unknown'}`,
    )
  }
  return result.data
}
