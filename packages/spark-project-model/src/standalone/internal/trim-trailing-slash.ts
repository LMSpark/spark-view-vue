/** 去除 URL/路径尾部斜杠。 */

export function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}
