<template>
  <div class="spark-renderer-test" style="background: white; padding: 20px; border-radius: 8px;">
    <h3>✅ SparkComponentRenderer 测试组件已加载</h3>
    <p>如果你能看到这段文字，说明组件成功加载了。</p>
    
    <el-alert type="success" :closable="false">
      组件渲染成功！接下来会添加实际功能。
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  console.log('✅ SparkRendererDemoSimple 组件已挂载')
})
</script>

<style scoped>
.spark-renderer-test {
  margin: 16px 0;
}
</style>
