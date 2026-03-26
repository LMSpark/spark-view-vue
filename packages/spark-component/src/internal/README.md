# internal

内部便利入口层：

1. `capability-context.ts`：内部父能力上下文 key
2. `index.ts`：聚合 core / system / page / components internal 入口

约定：

1. 公共使用方不从这里取类型或能力
2. 这里主要用于包内实现与重构期收口