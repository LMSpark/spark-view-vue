/**
 * config/ 目录 — PageModel 四文件持久化与解析。
 *
 * ## CRUD 角色分布
 * - **Read（加载 + 解析）**：page-config-loader.ts（HTTP 加载 + 缓存）、
 *   page-config-compiler.ts（文本 → 类型化数据）
 * - **Create / Delete（写入 + 页面生命周期）**：page-config-file-api.ts
 *   （文件写入、createPage/deletePage、版本管理）
 * - **共享类型**：config-types.ts（四文件契约、加载器基类、API 参数类型）
 *
 * 本 barrel 只 re-export compiler 的解析函数（Read 管线），
 * Loader 和 FileApi 由各自的 class 直接暴露，不通过 barrel。
 */

export {
  compileRule,
  normalizeRuleNode,
  parseCss,
  parsePageData,
  parseScript,
} from './page-config-compiler'
