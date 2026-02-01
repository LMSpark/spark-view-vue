import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'SPARK View',
  description: 'SPARK 组件架构文档',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/architecture/README_ARCHITECTURE' },
      { text: 'Project Overview', link: '/PROJECT_OVERVIEW' }
    ],
    sidebar: [
      {
        text: '快速开始',
        items: [
          { text: '项目总览', link: '/PROJECT_OVERVIEW' },
          { text: '架构说明', link: '/architecture/README_ARCHITECTURE' }
        ]
      },
      {
        text: '指南',
        items: [
          { text: 'FormCreate 使用', link: '/guides/README_FORMCREATE' },
          { text: '异步数据加载', link: '/guides/ASYNC_DATA_LOADING' }
        ]
      },
      {
        text: '数据管理',
        items: [
          { text: 'DataSet CRUD', link: '/data/DATASET_CRUD_GUIDE' },
          { text: '树形结构', link: '/data/README_TREE' }
        ]
      },
      {
        text: '归档文档',
        collapsed: true,
        items: [
          { text: 'SPARK 架构详解', link: '/archive/ARCHITECTURE_SPARK_DETAIL' },
          { text: 'CSR 迁移指南', link: '/archive/CSR_MIGRATION' }
        ]
      }
    ]
  }
})