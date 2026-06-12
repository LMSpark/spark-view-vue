/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-bundle-url
 * 职责：DTS ClassModel bundle 的相对路径与 manifest URL 解析（纯字符串/URL，无 Node FS）。
 * 边界：供运行时 loader 与编译脚本共用；不得引入 node:path / node:fs / typescript。
 */

export function dtsSourcePathToBundleRelativeJson(sourcePath: string): string {
  return `files/${sourcePath}.json`
}

export function resolveDtsBundleRelativeUrl(manifestUrl: string, relativePath: string): string {
  return new URL(relativePath.replace(/\\/g, '/'), new URL(manifestUrl)).href
}
