<template>
  <div class="list-page">
    <div class="list-header">
      <h1>📋 示例列表</h1>
      <p>使用 DSL 生成的动态列表页面</p>
    </div>

    <div class="list-container">
      <div class="list-filters">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索项目..."
          class="search-input"
        />
        <select v-model="sortBy" class="sort-select">
          <option value="name">按名称排序</option>
          <option value="date">按日期排序</option>
          <option value="status">按状态排序</option>
        </select>
      </div>

      <div class="list-grid">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="list-item"
          @click="goToDetail(item.id)"
        >
          <div class="item-icon">{{ item.icon }}</div>
          <div class="item-content">
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <div class="item-meta">
              <span class="status" :class="item.status">{{ getStatusText(item.status) }}</span>
              <span class="date">{{ item.date }}</span>
            </div>
          </div>
          <div class="item-arrow">→</div>
        </div>
      </div>

      <div v-if="filteredItems.length === 0" class="empty-state">
        <p>没有找到匹配的项目</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

interface ListItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  status: 'active' | 'pending' | 'completed';
  date: string;
}

const router = useRouter();

const searchQuery = ref('');
const sortBy = ref('name');

const items = ref<ListItem[]>([
  {
    id: 1,
    title: 'SSR 渲染示例',
    description: '服务端渲染的完整示例，展示首屏性能优化',
    icon: '⚡',
    status: 'completed',
    date: '2026-01-01',
  },
  {
    id: 2,
    title: 'CSR 交互示例',
    description: '客户端渲染和动态交互的实现',
    icon: '🎨',
    status: 'active',
    date: '2026-01-02',
  },
  {
    id: 3,
    title: '路由导航系统',
    description: 'Vue Router 集成和 SPA 导航',
    icon: '🛣️',
    status: 'active',
    date: '2026-01-03',
  },
  {
    id: 4,
    title: 'DSL 编译器',
    description: '从 DSL 到 Vue 代码的编译过程',
    icon: '⚙️',
    status: 'completed',
    date: '2025-12-28',
  },
  {
    id: 5,
    title: '条件渲染',
    description: 'if/else 条件逻辑在 DSL 中的实现',
    icon: '🔀',
    status: 'pending',
    date: '2026-01-05',
  },
  {
    id: 6,
    title: '循环列表',
    description: 'v-for 循环和数据迭代',
    icon: '🔁',
    status: 'pending',
    date: '2026-01-06',
  },
]);

const filteredItems = computed(() => {
  let result = items.value;

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
  }

  // 排序
  result = [...result].sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.title.localeCompare(b.title);
    } else if (sortBy.value === 'date') {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    } else if (sortBy.value === 'status') {
      return a.status.localeCompare(b.status);
    }
    return 0;
  });

  return result;
});

const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: '进行中',
    pending: '待开始',
    completed: '已完成',
  };
  return statusMap[status] || status;
};

const goToDetail = (id: number): void => {
  router.push({ name: 'detail', params: { id: String(id) } });
};
</script>

<style scoped>
.list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.list-header {
  text-align: center;
  margin-bottom: 40px;
}

.list-header h1 {
  font-size: 40px;
  font-weight: 700;
  margin: 0 0 12px;
  color: #333;
}

.list-header p {
  font-size: 16px;
  color: #666;
  margin: 0;
}

.list-container {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.list-filters {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
}

.search-input,
.sort-select {
  flex: 1;
  padding: 12px 16px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.search-input:focus,
.sort-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.list-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.list-item:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.item-icon {
  font-size: 40px;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
}

.item-content h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.item-content p {
  margin: 0 0 12px;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status.active {
  background: #e3f2fd;
  color: #2196f3;
}

.status.pending {
  background: #fff3e0;
  color: #ff9800;
}

.status.completed {
  background: #e8f5e9;
  color: #4caf50;
}

.date {
  font-size: 12px;
  color: #999;
}

.item-arrow {
  font-size: 24px;
  color: #667eea;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.list-item:hover .item-arrow {
  transform: translateX(4px);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state p {
  font-size: 16px;
  margin: 0;
}

@media (max-width: 768px) {
  .list-filters {
    flex-direction: column;
  }

  .item-icon {
    font-size: 32px;
  }

  .item-content h3 {
    font-size: 16px;
  }
}
</style>