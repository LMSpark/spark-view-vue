<script setup lang="ts">
/**
 * RendererDemoPage - 独立演示页面
 * 展示如何使用 Renderer 架构渲染不同类型的组件
 */
import { ref, reactive } from 'vue'
import DynamicRenderer from '@/components/renderers/DynamicRenderer.vue'

// 页面数据
const pageData = reactive({
  users: [
    { id: 1, name: '张三', age: 28, createTime: '2024-01-15' },
    { id: 2, name: '李四', age: 32, createTime: '2024-02-20' },
    { id: 3, name: '王五', age: 25, createTime: '2024-03-10' }
  ],
  formData: {
    name: '测试用户',
    age: 30,
    createTime: '2024-01-01'
  }
})

// 页面规则配置
const rules = ref([
  {
    type: 'div',
    class: 'renderer-demo-page',
    children: [
      {
        type: 'h1',
        children: ['🎨 Renderer 架构演示']
      },
      {
        type: 'div',
        class: 'demo-section',
        children: [
          {
            type: 'h2',
            children: ['📊 表格渲染示例']
          },
          {
            type: 'p',
            children: ['相同的 children 配置（text/number/date），根据父级 type="table" 自动渲染成表格列']
          },
          {
            type: 'table',
            dataSource: 'users',
            border: true,
            stripe: true,
            children: [
              {
                type: 'text',
                name: '姓名',
                value: 'name',
                width: 150
              },
              {
                type: 'number',
                name: '年龄',
                value: 'age',
                width: 100
              },
              {
                type: 'date',
                name: '创建时间',
                value: 'createTime',
                width: 150
              }
            ]
          }
        ]
      },
      {
        type: 'div',
        class: 'demo-section',
        children: [
          {
            type: 'h2',
            children: ['📝 表单渲染示例']
          },
          {
            type: 'p',
            children: ['相同的 children 配置，根据父级 type="form" 自动渲染成表单字段']
          },
          {
            type: 'form',
            labelWidth: '100px',
            children: [
              {
                type: 'text',
                name: '姓名',
                value: 'name'
              },
              {
                type: 'number',
                name: '年龄',
                value: 'age',
                min: 0,
                max: 150
              },
              {
                type: 'date',
                name: '创建时间',
                value: 'createTime'
              }
            ]
          }
        ]
      },
      {
        type: 'div',
        class: 'demo-section',
        children: [
          {
            type: 'h2',
            children: ['📋 详情展示示例']
          },
          {
            type: 'p',
            children: ['相同的 children 配置，根据父级 type="div" 自动渲染成详情展示']
          },
          {
            type: 'div',
            class: 'detail-container',
            children: [
              {
                type: 'text',
                name: '姓名',
                value: 'name'
              },
              {
                type: 'number',
                name: '年龄',
                value: 'age'
              },
              {
                type: 'date',
                name: '创建时间',
                value: 'createTime'
              }
            ]
          }
        ]
      }
    ]
  }
])

// 处理数据更新
function handleUpdate(field: string, value: any) {
  console.log('数据更新:', field, value)
  ;(pageData.formData as any)[field] = value
}
</script>

<template>
  <div class="renderer-demo-container">
    <h1>测试渲染</h1>
    <p>如果你能看到这行字，说明页面基本渲染正常</p>
    <p>规则数量: {{ rules.length }}</p>
    <p>准备渲染 DynamicRenderer...</p>
    <DynamicRenderer
      v-for="(rule, idx) in rules"
      :key="idx"
      :rule="rule"
      :data="pageData"
      @update="handleUpdate"
    />
    <p>DynamicRenderer 渲染完成</p>
  </div>
</template>

<style scoped>
.renderer-demo-container {
  padding: 20px;
  background: #f0f2f5;
  min-height: 100vh;
}

:deep(.renderer-demo-page) {
  max-width: 1200px;
  margin: 0 auto;
}

:deep(.renderer-demo-page h1) {
  margin: 0 0 30px 0;
  font-size: 32px;
  color: #303133;
  text-align: center;
}

:deep(.demo-section) {
  margin-bottom: 30px;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

:deep(.demo-section h2) {
  margin: 0 0 12px 0;
  font-size: 20px;
  color: #303133;
}

:deep(.demo-section p) {
  margin: 0 0 20px 0;
  padding: 12px;
  background: #ecf5ff;
  border-left: 4px solid #409eff;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

:deep(.detail-container) {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;
}
</style>
