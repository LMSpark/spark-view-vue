// 服务端渲染类型声明
declare module './dist/server/entry-server.js' {
    export function render(url: string): Promise<{
        html: string
        title: string
        meta: Record<string, any>
    }>
}
