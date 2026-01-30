<template>
  <div class="spark-demo">
    <h1>SPARK 架构演示</h1>
    <p>验证能力继承和组件解耦</p>

    <!-- SPARK 组件渲染器 -->
    <SparkComponentRenderer :config="gridConfig" />

    <!-- 调试信息 -->
    <div class="debug-info">
      <h3>调试信息</h3>
      <pre>{{ debugInfo }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { SparkEJ2GridConfig } from '@/types/ej2-components'
import SparkComponentRenderer from '../features/spark/components/SparkComponentRenderer.vue'

// 网格配置
const gridConfig = ref<SparkEJ2GridConfig>({
  type: 'spark-ej2-grid',
  dataSource: [
    { id: 1, name: '张三', personal: { age: 25, gender: '男' }, work: { department: '技术部', position: '工程师' }, salary: 8000 },
    { id: 2, name: '李四', personal: { age: 30, gender: '女' }, work: { department: '销售部', position: '经理' }, salary: 7500 },
    { id: 3, name: '王五', personal: { age: 28, gender: '男' }, work: { department: '人事部', position: '专员' }, salary: 7000 },
    { id: 4, name: '赵六', personal: { age: 35, gender: '女' }, work: { department: '财务部', position: '主管' }, salary: 9000 },
    { id: 5, name: '孙七', personal: { age: 27, gender: '男' }, work: { department: '技术部', position: '设计师' }, salary: 8500 }
  ],
  allowPaging: false,
  height: '350px',
  children: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'name', headerText: '姓名', width: '120' },
    // 个人信息组
    {
      type: 'spark-ej2-column',
      headerText: '个人信息',
      textAlign: 'Center',
      children: [
        { type: 'spark-ej2-column', field: 'personal.age', headerText: '年龄', width: '80', textAlign: 'Center' },
        { type: 'spark-ej2-column', field: 'personal.gender', headerText: '性别', width: '80', textAlign: 'Center' }
      ]
    },
    // 工作信息组
    {
      type: 'spark-ej2-column',
      headerText: '工作信息',
      textAlign: 'Center',
      children: [
        { type: 'spark-ej2-column', field: 'work.department', headerText: '部门', width: '120' },
        { type: 'spark-ej2-column', field: 'work.position', headerText: '职位', width: '100' }
      ]
    },
    { type: 'spark-ej2-column', field: 'salary', headerText: '薪资', width: '100', textAlign: 'Right', format: 'C2' }
  ]
})
// 调试信息
const debugInfo = ref('加载中...')

onMounted(() => {
  debugInfo.value = 'SPARK 组件已加载，检查控制台日志查看能力继承情况'
})
</script>

<style scoped>
.spark-demo {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.debug-info {
  margin-top: 30px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

.debug-info h3 {
  margin-top: 0;
  color: #333;
}

.debug-info pre {
  background: #fff;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}
</style>