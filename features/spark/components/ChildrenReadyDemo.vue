<template>
  <div class="demo-app">
    <h2>子组件渲染完成后再渲染父组件 - 演示</h2>

    <!-- 使用父组件 -->
    <ParentWithChildren :config="parentConfig" />
  </div>
</template>

<script setup lang="ts">
import ParentWithChildren from './ParentWithChildren.vue'

// 父组件配置
const parentConfig = {
  type: 'parent-with-children',
  title: '父组件标题',
  children: [
    {
      type: 'child-component',
      name: '子组件A',
      data: '数据A'
    },
    {
      type: 'child-component',
      name: '子组件B',
      data: '数据B'
    },
    {
      type: 'child-component',
      name: '子组件C',
      data: '数据C'
    }
  ]
}
</script>

<style scoped>
.demo-app {
  padding: 20px;
}

h2 {
  color: #333;
  margin-bottom: 20px;
}
</style></content>
<parameter name="filePath">d:\SPARK_VIEW\features\spark\components\ChildrenReadyDemo.vue