# 缓存失效分层

SPARK 的页面文件缓存由 `spark-utils` 的 FileLoader 提供，`spark-page-config` 通过 PageNode 子模型使用它。应用层不要直接创建四文件 loader。

## 运行态

```ts
import { createPageNodeFactory } from '@spark-view/spark-page-config'

const factory = createPageNodeFactory({ fileStorage: 'localStorage' })
const pageNode = factory.create('home')

await pageNode.load()
factory.clearPageCache('home')
```

## 设计态

```ts
editor.notifyPageFileChanged(pageId, 'rule.json')
editor.notifyPageFileChanged(pageId, '__bulk')
```

`ProjectEditor` 会失效对应 PageNode 文件缓存，并同步 revision 给消费层。

## 单一职责

| class | 职责 |
|---|---|
| `PageNodeFileCache` | 缓存失效 |
| `PageNodeFileCreator` | 创建四文件 |
| `PageNodeFileDeleter` | 删除四文件 |
| `PageNodeFileVersions` | 文件版本 |

消费层不要继承 `PageContentLoader`，不要直接导入 file-api，也不要自行拼四文件 URL。
