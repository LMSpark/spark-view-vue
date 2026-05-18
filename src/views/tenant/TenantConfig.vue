<template>
  <div class="tenant-config-legacy">
    <el-result
      icon="info"
      title="租户配置已整合"
      sub-title="租户配置现在统一在平台租户管理中维护。"
    >
      <template #extra>
        <el-button type="primary" @click="goToTenantManagement">前往租户管理</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill tenant-config
 * @catalogInternal
 * @description 旧租户配置演示入口；已整合到平台租户管理页，仅保留兼容重定向。
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function legacyTenantQuery(): string | null {
  const tenant = route.query['tenant']
  if (typeof tenant === 'string' && tenant.trim()) return tenant.trim()
  if (Array.isArray(tenant) && typeof tenant[0] === 'string' && tenant[0].trim()) {
    return tenant[0].trim()
  }
  return null
}

function goToTenantManagement(): void {
  const tenant = legacyTenantQuery()
  void router.replace({
    path: '/platform/tenants',
    query: tenant === null ? {} : { tenant },
  })
}

onMounted(() => {
  goToTenantManagement()
})
</script>

<style scoped>
.tenant-config-legacy {
  display: flex;
  min-height: 360px;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
</style>
