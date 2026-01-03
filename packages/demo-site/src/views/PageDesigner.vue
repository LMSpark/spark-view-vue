<template>
  <div class="page-designer">
    <header class="designer-header">
      <h1>🎨 页面设计器 (基于 form-create-designer)</h1>
      <div class="header-actions">
        <el-button type="primary" @click="exportDsl">导出 DSL</el-button>
        <el-button type="success" @click="exportJson">导出 JSON</el-button>
        <el-button @click="preview">预览</el-button>
        <el-button @click="clearAll">清空</el-button>
        <el-button @click="loadTemplate">加载模板</el-button>
      </div>
    </header>

    <main class="designer-main">
      <fc-designer 
        ref="designer" 
        :config="designerConfig"
        height="calc(100vh - 100px)"
      />
    </main>

    <!-- 预览对话框 -->
    <el-dialog 
      v-model="previewVisible" 
      title="页面预览" 
      width="90%"
    >
      <template #header>
        <div class="dialog-header">
          <span>页面预览</span>
          <el-button-group>
            <el-button 
              :type="previewMode === 'desktop' ? 'primary' : ''" 
              @click="previewMode = 'desktop'"
            >
              💻 桌面
            </el-button>
            <el-button 
              :type="previewMode === 'tablet' ? 'primary' : ''" 
              @click="previewMode = 'tablet'"
            >
              📱 平板
            </el-button>
            <el-button 
              :type="previewMode === 'mobile' ? 'primary' : ''" 
              @click="previewMode = 'mobile'"
            >
              📱 手机
            </el-button>
          </el-button-group>
        </div>
      </template>
      
      <div class="preview-container" :class="previewMode">
        <div class="preview-content">
          <form-create v-model:api="fApi" :rule="previewRule" :option="previewOption"></form-create>
        </div>
      </div>

      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 导出对话框 -->
    <el-dialog v-model="exportVisible" title="导出代码" width="900px">
      <el-tabs v-model="exportTab">
        <el-tab-pane label="SPARK.View DSL" name="dsl">
          <div class="code-toolbar">
            <el-button type="primary" size="small" @click="copyCode('dsl')">复制</el-button>
            <el-button size="small" @click="downloadCode('dsl', 'yaml')">下载</el-button>
          </div>
          <pre class="code-block">{{ exportCode.dsl }}</pre>
        </el-tab-pane>
        
        <el-tab-pane label="JSON" name="json">
          <div class="code-toolbar">
            <el-button type="primary" size="small" @click="copyCode('json')">复制</el-button>
            <el-button size="small" @click="downloadCode('json', 'json')">下载</el-button>
          </div>
          <pre class="code-block">{{ exportCode.json }}</pre>
        </el-tab-pane>
        
        <el-tab-pane label="Vue 组件" name="vue">
          <div class="code-toolbar">
            <el-button type="primary" size="small" @click="copyCode('vue')">复制</el-button>
            <el-button size="small" @click="downloadCode('vue', 'vue')">下载</el-button>
          </div>
          <pre class="code-block">{{ exportCode.vue }}</pre>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 模板对话框 -->
    <el-dialog v-model="templateVisible" title="选择页面模板" width="800px">
      <el-row :gutter="20">
        <el-col 
          :span="8" 
          v-for="template in templates" 
          :key="template.id"
          style="margin-bottom: 20px;"
        >
          <el-card 
            :body-style="{ padding: '0px' }" 
            shadow="hover" 
            class="template-card"
            @click="applyTemplate(template)"
          >
            <div class="template-image">{{ template.icon }}</div>
            <div style="padding: 14px;">
              <h4>{{ template.name }}</h4>
              <p class="template-desc">{{ template.description }}</p>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const designer = ref();
const previewVisible = ref(false);
const previewMode = ref<'desktop' | 'tablet' | 'mobile'>('desktop');
const exportVisible = ref(false);
const exportTab = ref('dsl');
const templateVisible = ref(false);
const fApi = ref();
const previewRule = ref([]);
const previewOption = ref({});
const exportCode = ref({
  dsl: '',
  json: '',
  vue: ''
});

// 设计器配置
const designerConfig = {
  showBaseForm: true,
  showFormConfig: true,
};

// 页面模板
const templates = [
  {
    id: 'landing',
    name: '落地页',
    icon: '🚀',
    description: '产品介绍落地页',
    rule: [
      { type: 'input', field: 'title', title: '主标题', props: { placeholder: '欢迎使用 SPARK.View' } },
      { type: 'input', field: 'subtitle', title: '副标题', props: { placeholder: '快速构建应用' } },
      { type: 'button', field: 'cta', title: '行动按钮', props: { text: '立即开始' } }
    ]
  },
  {
    id: 'form',
    name: '表单页',
    icon: '📋',
    description: '信息收集表单',
    rule: [
      { type: 'input', field: 'name', title: '姓名', props: { placeholder: '请输入姓名' } },
      { type: 'input', field: 'email', title: '邮箱', props: { type: 'email' } },
      { type: 'input', field: 'phone', title: '电话', props: { placeholder: '请输入电话' } }
    ]
  },
  {
    id: 'login',
    name: '登录页',
    icon: '🔐',
    description: '用户登录',
    rule: [
      { type: 'input', field: 'username', title: '用户名', props: { placeholder: '请输入用户名' } },
      { type: 'input', field: 'password', title: '密码', props: { type: 'password' } },
      { type: 'checkbox', field: 'remember', title: '记住我', props: {} }
    ]
  },
  {
    id: 'contact',
    name: '联系页',
    icon: '📧',
    description: '联系我们',
    rule: [
      { type: 'input', field: 'name', title: '姓名' },
      { type: 'input', field: 'email', title: '邮箱', props: { type: 'email' } },
      { type: 'textarea', field: 'message', title: '留言', props: { rows: 4 } }
    ]
  },
  {
    id: 'blank',
    name: '空白页',
    icon: '📄',
    description: '从头开始',
    rule: []
  }
];

const exportDsl = () => {
  try {
    const rule = designer.value?.getRule() || [];
    const option = designer.value?.getOption() || {};
    
    exportCode.value.dsl = convertToSparkDsl(rule, option);
    exportCode.value.json = JSON.stringify({ rule, option }, null, 2);
    exportCode.value.vue = generateVueComponent(rule, option);
    
    exportVisible.value = true;
    exportTab.value = 'dsl';
  } catch (err: unknown) {
    const error = err as Error;
    ElMessage.error(`导出失败: ${error.message}`);
  }
};

const exportJson = () => {
  try {
    const rule = designer.value?.getRule() || [];
    const option = designer.value?.getOption() || {};
    
    exportCode.value.json = JSON.stringify({ rule, option }, null, 2);
    exportTab.value = 'json';
    exportVisible.value = true;
  } catch (err: unknown) {
    const error = err as Error;
    ElMessage.error(`导出失败: ${error.message}`);
  }
};

const preview = () => {
  try {
    previewRule.value = designer.value?.getRule() || [];
    previewOption.value = designer.value?.getOption() || {};
    previewMode.value = 'desktop';
    previewVisible.value = true;
  } catch (err: unknown) {
    const error = err as Error;
    ElMessage.error(`预览失败: ${error.message}`);
  }
};

const clearAll = () => {
  ElMessageBox.confirm('确定要清空所有内容吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    designer.value?.clearDragRule();
    ElMessage.success('已清空');
  }).catch(() => {});
};

const loadTemplate = () => {
  templateVisible.value = true;
};

const applyTemplate = (template: typeof templates[0]) => {
  designer.value?.setRule(template.rule);
  templateVisible.value = false;
  ElMessage.success(`已加载模板：${template.name}`);
};

const copyCode = (type: keyof typeof exportCode.value) => {
  const code = exportCode.value[type];
  navigator.clipboard.writeText(code).then(() => {
    ElMessage.success('已复制到剪贴板');
  }).catch(() => {
    ElMessage.error('复制失败');
  });
};

const downloadCode = (type: string, ext: string) => {
  const code = exportCode.value[type as keyof typeof exportCode.value];
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `page.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('下载成功');
};

// Form-create 规则接口
interface FormCreateRule {
  type: string;
  field?: string;
  title?: string;
  props?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FormCreateOption {
  form?: Record<string, unknown>;
  global?: Record<string, unknown>;
  [key: string]: unknown;
}

// 转换为 SPARK.View DSL
function convertToSparkDsl(rule: FormCreateRule[], _option: FormCreateOption) {
  const children = rule.map(item => {
    const props: Record<string, unknown> = {};
    
    if (item.props) {
      Object.assign(props, item.props);
    }
    
    const component: Record<string, unknown> = {
      type: item.type,
      props
    };
    
    if (item.field) {
      component.id = item.field;
    }
    if (item.title) {
      component.title = item.title;
    }
    
    return component;
  });

  return JSON.stringify({
    dslVersion: '1.0',
    page: {
      id: 'designed-page',
      title: '设计的页面',
      layout: {
        type: 'container',
        props: {
          padding: '40px 20px',
          maxWidth: '1200px',
          margin: '0 auto'
        },
        children
      }
    },
    data: {}
  }, null, 2);
}

// 生成 Vue 组件
function generateVueComponent(rule: FormCreateRule[], option: FormCreateOption) {
  const lines = [
    '<template>',
    '  <div class="spark-page">',
    '    <form-create ',
    '      v-model:api="fApi" ',
    '      :rule="rule" ',
    '      :option="option"',
    '    />',
    '  </div>',
    '</template>',
    '',
    '<' + 'script setup lang="ts">',
    'import { ref } from \'vue\';',
    '',
    'const fApi = ref();',
    '',
    'const rule = ' + JSON.stringify(rule, null, 2) + ';',
    '',
    'const option = ' + JSON.stringify(option, null, 2) + ';',
    '</' + 'script>',
    '',
    '<style scoped>',
    '.spark-page {',
    '  max-width: 1200px;',
    '  margin: 0 auto;',
    '  padding: 40px 20px;',
    '}',
    '</style>'
  ];
  return lines.join('\n');
}
</script>

<style scoped>
.page-designer {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.designer-header {
  background: white;
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  z-index: 10;
}

.designer-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.designer-main {
  flex: 1;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 40px;
}

.preview-container {
  transition: all 0.3s;
  margin: 0 auto;
}

.preview-container.desktop { width: 100%; }
.preview-container.tablet { width: 768px; }
.preview-container.mobile { width: 375px; }

.preview-content {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  background: white;
  min-height: 400px;
}

.code-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  justify-content: flex-end;
}

.code-block {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 500px;
  border: 1px solid #e9ecef;
  margin: 0;
}

.template-card {
  cursor: pointer;
  transition: all 0.3s;
}

.template-card:hover {
  transform: translateY(-4px);
}

.template-image {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-size: 48px;
}

.template-desc {
  font-size: 12px;
  color: #666;
  margin: 8px 0 0 0;
}
</style>
