import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000

async function createServer() {
    const app = express()

    let vite: any
    if (!isProduction) {
        // 开发模式：创建 Vite 开发服务器
        vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'custom'
        })
        app.use(vite.middlewares)
    } else {
        // 生产模式：使用构建后的文件
        app.use(express.static(path.resolve(__dirname, 'dist/client'), { index: false }))
    }

    // SSR 请求处理 (Express 5 需要使用中间件的 next 参数来处理所有路由)
    app.use(async (req, res, next) => {
        const url = req.originalUrl

        try {
            let template: string
            let render: any

            if (!isProduction) {
                // 开发模式
                template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8')
                template = await vite.transformIndexHtml(url, template)
                render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
            } else {
                // 生产模式
                template = fs.readFileSync(path.resolve(__dirname, 'dist/client/index.html'), 'utf-8')
                // @ts-ignore - 动态导入构建产物
                render = (await import('./dist/server/entry-server.js')).render
            }

            // 渲染应用
            const { html: appHtml, title } = await render(url)

            // 注入渲染结果到模板
            const html = template
                .replace('<div id="app"></div>', `<div id="app">${appHtml}</div>`)
                .replace('<title>Form Create TypeScript Demo</title>', `<title>${title}</title>`)

            res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
        } catch (e: any) {
            // 如果出错，让 Vite 修正堆栈跟踪
            if (!isProduction && vite) {
                vite.ssrFixStacktrace(e)
            }
            console.error(e)
            res.status(500).end(e.message)
        }
    })

    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`)
        console.log(`📦 Mode: ${isProduction ? 'production' : 'development'}`)
    })
}

createServer()
