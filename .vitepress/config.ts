import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'SPARK View',
  description: 'SPARK 组件架构文档',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Deep Dive', link: '/DOCS_DEEP_DIVE' },
      { text: 'README', link: '/README_SPARK' }
    ],
    sidebar: [
      {
        text: 'Docs',
        items: [
          { text: 'Deep Dive', link: '/DOCS_DEEP_DIVE' },
          { text: 'Quick Start', link: '/README_SPARK' }
        ]
      }
    ]
  }
})