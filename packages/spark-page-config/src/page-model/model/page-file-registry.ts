/**
 * PageNode four-file registry.
 *
 * 四文件是 PageNode 的持久化资产：read 层用它们寻址远端文件，
 * model/update 层用它们驱动保存、版本和编辑器标签。
 */

export const PAGE_NODE_FILE_NAMES: readonly ['rule.json', 'pagedata.json', 'script.js', 'style.css'] = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
]

export type PageNodeFileName = typeof PAGE_NODE_FILE_NAMES[number]

/**
 * PageNode file cache/address path builder.
 *
 * FileLoader 的缓存 key 与远端相对路径必须共用同一套编码规则。
 */
export class PageNodeFilePath {
  static forFile(pageId: string, filename: string): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

  static forPage(pageId: string): readonly string[] {
    return PAGE_NODE_FILE_NAMES.map(filename => PageNodeFilePath.forFile(pageId, filename))
  }
}

/**
 * PageNode 文件描述符，用于动态注册文件类型。
 */
export class PageNodeFileDescriptor {
  readonly name: string
  readonly required: boolean

  constructor(params: { name: string; required: boolean }) {
    const name = params.name.trim()
    if (name === '') {
      throw new Error('PageNode file descriptor name must be a non-empty string')
    }
    this.name = name
    this.required = params.required
  }
}

export type PageNodeFileRegistryView = ReadonlyMap<string, PageNodeFileDescriptor>

export class PageNodeFileRegistry extends Map<string, PageNodeFileDescriptor> {
  static default(): PageNodeFileRegistry {
    return new PageNodeFileRegistry(
      PAGE_NODE_FILE_NAMES.map((name) => [
        name,
        new PageNodeFileDescriptor({
          name,
          required: name === 'rule.json' || name === 'pagedata.json',
        }),
      ]),
    )
  }
}

export function createDefaultPageNodeFileRegistry(): PageNodeFileRegistry {
  return PageNodeFileRegistry.default()
}
