<template>
  <div class="form-designer-page">
    <header class="page-header">
      <h1>🎨 表单设计器</h1>
      <p>可视化拖拽设计表单，生成 DSL 配置</p>
    </header>

    <main class="designer-container">
      <fc-designer 
        ref="designer" 
        :config="config" 
        :handle="handle"
        height="calc(100vh - 180px)"
      >
        <template #handle>
          <div class="toolbar">
            <el-button-group>
              <el-button @click="exportDsl" type="primary">
                <el-icon><Document /></el-icon>
                导出 DSL
              </el-button>
              <el-button @click="importDsl">
                <el-icon><Upload /></el-icon>
                导入 DSL
              </el-button>
              <el-button @click="preview">
                <el-icon><View /></el-icon>
                预览
              </el-button>
              <el-button @click="clearAll">
                <el-icon><Delete /></el-icon>
                清空
              </el-button>
            </el-button-group>
          </div>
        </template>
      </fc-designer>
    </main>

    <!-- 预览对话框 -->
    <el-dialog 
      v-model="previewVisible" 
      title="表单预览" 
      width="60%"
      :destroy-on-close="true"
    >
      <form-create 
        v-if="previewRule" 
        v-model="formData" 
        v-model:api="fapi"
        :rule="previewRule" 
        :option="previewOption"
        @submit="onSubmit"
      />
    </el-dialog>

    <!-- DSL 导出对话框 -->
    <el-dialog 
      v-model="dslVisible" 
      title="导出 DSL 配置" 
      width="70%"
    >
      <el-tabs v-model="exportTab">
        <el-tab-pane label="SPARK.View DSL" name="spark">
          <pre class="code-block">{{ sparkDsl }}</pre>
          <el-button @click="copyDsl" style="margin-top: 10px;">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </el-tab-pane>
        <el-tab-pane label="Form-Create JSON" name="json">
          <pre class="code-block">{{ formCreateJson }}</pre>
          <el-button @click="copyJson" style="margin-top: 10px;">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </el-tab-pane>
        <el-tab-pane label="Vue Template" name="template">
          <pre class="code-block">{{ vueTemplate }}</pre>
          <el-button @click="copyTemplate" style="margin-top: 10px;">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document, Upload, View, Delete, CopyDocument } from '@element-plus/icons-vue';

const designer = ref();
const previewVisible = ref(false);
const dslVisible = ref(false);
const exportTab = ref('spark');
const previewRule = ref(null);
const previewOption = ref({});
const formData = ref({});
const fapi = ref(null);
const sparkDsl = ref('');
const formCreateJson = ref('');
const vueTemplate = ref('');

// 设计器配置
const config = ref({
  // 自动选中第一个组件
  autoActive: true,
  // 显示保存按钮
  showSaveBtn: false,
  // 字段只读
  fieldReadonly: false,
});

// 工具栏按钮
const handle = ref([
  {
    label: '帮助文档',
    handle: () => {
      window.open('https://view.form-create.com/', '_blank');
    },
  },
]);

// 导出 DSL
const exportDsl = () => {
  const rule = designer.value.getRule();
  const option = designer.value.getOption();
  
  // 转换为 SPARK.View DSL 格式
  sparkDsl.value = convertToSparkDsl(rule);
  
  // Form-Create 原始 JSON
  formCreateJson.value = JSON.stringify(rule, null, 2);
  
  // Vue 模板代码
  vueTemplate.value = generateVueTemplate(rule, option);
  
  dslVisible.value = true;
};

// 转换为 SPARK.View DSL 格式
const convertToSparkDsl = (rule: FormCreateRule[]) => {
  const dsl = {
    dslVersion: '1.0',
    page: {
      id: 'form-page',
      title: '表单页面',
      layout: {
        type: 'container',
        props: {
          maxWidth: '800px',
          padding: '40px 20px',
          margin: '0 auto',
        },
        children: convertFormToDsl(rule),
      },
    },
    data: {},
  };
  
  return JSON.stringify(dsl, null, 2);
};

// 转换表单组件到 DSL
const convertFormToDsl = (rule: FormCreateRule[]): Array<Record<string, unknown>> => {
  return rule.map((item) => {
    const component: Record<string, unknown> = {
      type: mapFormComponentType(item.type),
      id: item.field || undefined,
      props: {
        ...item.props,
        label: item.title || undefined,
        placeholder: item.placeholder || undefined,
      },
    };
    
    // 处理必填规则
    if (Array.isArray(item.validate) && item.validate.some((v: { required?: boolean }) => v.required)) {
      component.props.required = true;
    }
    
    // 处理子组件
    if (item.children && item.children.length > 0) {
      component.children = convertFormToDsl(item.children);
    }
    
    return component;
  });
};

// 映射组件类型
const mapFormComponentType = (formCreateType: string): string => {
  const typeMap: Record<string, string> = {
    input: 'input',
    textarea: 'textarea',
    select: 'select',
    radio: 'radio',
    checkbox: 'checkbox',
    datePicker: 'date-picker',
    timePicker: 'time-picker',
    upload: 'upload',
    rate: 'rate',
    slider: 'slider',
    switch: 'switch',
    button: 'button',
    // 默认映射为 input
  };
  
  return typeMap[formCreateType] || 'input';
};

// 生成 Vue 模板
const generateVueTemplate = (rule: FormCreateRule[], option: FormCreateOption) => {
  const ruleStr = JSON.stringify(rule, null, 2);
  const optionStr = JSON.stringify(option, null, 2);
  return `<template>
  <form-create
    v-model="formData"
    v-model:api="fapi"
    :rule="rule"
    :option="option"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import formCreate from '@form-create/element-ui';

const rule = ref(${ruleStr});
const option = ref(${optionStr});
const formData = ref({});
const fapi = ref(null);

const onSubmit = (formData: any) => {
  console.log('提交数据:', formData);
};
<\/script>`;
};

// 导入 DSL
const importDsl = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请输入 Form-Create JSON 配置', '导入配置', {
      confirmButtonText: '导入',
      cancelButtonText: '取消',
      inputType: 'textarea',
    });
    
    if (value) {
      const rule = JSON.parse(value);
      designer.value.setRule(rule);
      ElMessage.success('导入成功');
    }
  } catch (error: unknown) {
    if (error !== 'cancel') {
      const message = error instanceof Error ? error.message : String(error);
      ElMessage.error('导入失败: ' + message);
    }
  }
};

// 预览表单
const preview = () => {
  previewRule.value = designer.value.getRule();
  previewOption.value = designer.value.getOption();
  formData.value = {};
  previewVisible.value = true;
};

// 清空设计器
const clearAll = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有组件吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    designer.value.setRule([]);
    ElMessage.success('已清空');
  } catch {
    // 用户取消
  }
};

// 表单提交
const onSubmit = (formData: Record<string, unknown>) => {
  console.log('表单数据:', formData);
  ElMessage.success('表单提交成功！查看控制台');
};

// 复制功能
const copyDsl = () => {
  copyToClipboard(sparkDsl.value);
};

const copyJson = () => {
  copyToClipboard(formCreateJson.value);
};

const copyTemplate = () => {
  copyToClipboard(vueTemplate.value);
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制到剪贴板');
  }).catch(() => {
    ElMessage.error('复制失败');
  });
};
</script>

<style scoped>
.form-designer-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.page-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 40px 20px;
  text-align: center;
}

.page-header h1 {
  font-size: 32px;
  margin: 0 0 10px 0;
}

.page-header p {
  font-size: 16px;
  opacity: 0.9;
  margin: 0;
}

.designer-container {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

.toolbar {
  padding: 10px;
  background: white;
  border-radius: 4px;
  margin-bottom: 10px;
}

.code-block {
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
}

:deep(.fc-designer) {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
</style>
