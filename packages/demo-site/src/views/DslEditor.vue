<template>
  <div class="dsl-editor-page">
    <header class="page-header">
      <h1>⚡ DSL 编辑器</h1>
      <p>可视化设计 + 代码编辑双模式</p>
    </header>

    <div class="mode-switch">
      <el-switch
        v-model="isDesignerMode"
        active-text="🎨 可视化设计"
        inactive-text="💻 代码编辑"
        size="large"
        @change="handleModeSwitch"
      />
    </div>

    <main class="editor-main">
      <!-- 可视化设计模式 -->
      <div v-if="isDesignerMode" class="designer-mode">
        <div class="designer-panel">
          <FormCreateDesigner
            ref="designerRef"
            :option="designerOption"
            @submit="handleDesignerSubmit"
          />
        </div>
        <div class="preview-panel">
          <div class="preview-header">
            <strong>✅ 实时预览</strong>
          </div>
          <div class="preview-content">
            <FormCreate v-if="currentRule.length > 0" :rule="currentRule" :option="currentOption" />
            <div v-else class="empty-state">
              <p>从左侧拖拽组件开始设计</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 代码编辑模式 -->
      <div v-else class="code-mode">
        <div class="editor-panel">
          <Editor v-model="dslContent" @update="handleDslUpdate" />
        </div>

        <div class="preview-panel">
          <div class="preview-header">
            <strong>✅ 实时预览</strong>
          </div>
          <div class="preview-content">
            <FormCreate v-if="currentRule.length > 0" :rule="currentRule" :option="currentOption" />
            <div v-else class="empty-state">
              <p>在左侧编辑 DSL 代码</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 导出按钮 -->
    <div class="action-bar">
      <el-button type="primary" @click="exportDsl">导出 DSL (JSON)</el-button>
      <el-button @click="copyDsl">复制到剪贴板</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeMount } from 'vue';
import Editor from '../components/Editor.vue';
import { parse } from '@spark-view/dsl-parser';
import FormCreate from '@form-create/element-ui';
import * as Designer from '@form-create/designer';
import { ElMessage } from 'element-plus';
import type { FormCreateRule, FormCreateOption } from '@spark-view/dsl-parser';
import { customLayoutComponents, layoutComponents } from '@spark-view/runtime';

const FormCreateDesigner = (Designer as any).default || Designer;
const formCreateInstance = (Designer as any).formCreate || FormCreate;

// 立即注册 Vue 组件到 form-create（模块加载时）
Object.entries(layoutComponents).forEach(([name, component]) => {
  if (formCreateInstance && typeof formCreateInstance.component === 'function') {
    formCreateInstance.component(name, component);
    console.log(`✅ [模块加载] 已注册 Vue 组件: ${name}`);
  }
});

// 立即注册 DragRule 到设计器（模块加载时）
console.log('🔧 [模块加载] 开始注册 DragRule...');
if (FormCreateDesigner && typeof FormCreateDesigner.addDragRule === 'function') {
  customLayoutComponents.forEach((dragRule) => {
    FormCreateDesigner.addDragRule(dragRule);
    console.log(`✅ [模块加载] 已注册 DragRule: ${dragRule.label}`);
  });
} else {
  console.warn('⚠️ [模块加载] FormCreateDesigner.addDragRule 方法不可用');
}

const isDesignerMode = ref(true); // 默认使用设计器模式
const designerRef = ref();
const currentRule = ref<FormCreateRule[]>([]);
const currentOption = ref<FormCreateOption>({});

// 设计器配置 - 隐藏提交按钮
const designerOption = {
  submitBtn: {
    show: false
  },
  resetBtn: {
    show: false
  },
  form: {
    inline: false,
    labelPosition: 'top',
    hideRequiredAsterisk: false,
    size: 'default',
    labelWidth: '125px'
  }
};

// DSL 代码（用于代码模式）
const dslContent = ref(`{
  "dslVersion": "1.0",
  "page": {
    "id": "example",
    "title": "示例页面",
    "rule": [
      {
        "type": "ElCard",
        "props": {
          "header": "欢迎使用 SPARK.View",
          "shadow": "hover"
        },
        "children": [
          {
            "type": "ElText",
            "props": {
              "size": "large"
            },
            "children": ["拖拽组件或编辑代码，开始创建你的页面"]
          },
          {
            "type": "ElDivider"
          },
          {
            "type": "ElButton",
            "props": {
              "type": "primary"
            },
            "children": ["开始使用"]
          }
        ]
      }
    ],
    "option": {
      "form": {},
      "submitBtn": false,
      "resetBtn": false
    }
  },
  "data": {}
}`);

// 模式切换处理
const handleModeSwitch = async (designerMode: boolean) => {
  if (designerMode) {
    // 切换到设计器模式：从代码生成 rule
    try {
      const ast = parse(dslContent.value);
      currentRule.value = ast.page.rule || [];
      currentOption.value = ast.page.option || {};
      
      // 等待 DOM 更新后设置设计器
      await nextTick();
      if (designerRef.value) {
        designerRef.value.setRule(currentRule.value);
        designerRef.value.setOption(currentOption.value);
      }
      ElMessage.success('已切换到可视化设计模式');
    } catch (error) {
      ElMessage.error('DSL 解析失败，请检查代码格式');
      console.error(error);
    }
  } else {
    // 切换到代码模式：从设计器生成代码
    try {
      if (designerRef.value) {
        const rule = designerRef.value.getRule();
        const option = designerRef.value.getOption();
        
        const dslObj = {
          dslVersion: '1.0',
          page: {
            id: 'example',
            title: '示例页面',
            rule,
            option
          },
          data: {}
        };
        
        dslContent.value = JSON.stringify(dslObj, null, 2);
      }
      ElMessage.success('已切换到代码编辑模式');
    } catch (error) {
      ElMessage.error('生成代码失败');
      console.error(error);
    }
  }
};

// 设计器提交处理
const handleDesignerSubmit = (formData: unknown) => {
  console.log('Form submitted:', formData);
};

// 代码编辑更新处理
const handleDslUpdate = () => {
  try {
    const ast = parse(dslContent.value);
    
    // 处理数据绑定
    const processedRule = processDataBinding(ast.page.rule || [], ast.data || {});
    
    currentRule.value = processedRule;
    currentOption.value = ast.page.option || {
      form: {},
      submitBtn: false,
      resetBtn: false
    };
  } catch (error) {
    console.error('DSL parsing error:', error);
  }
};

// 导出 DSL
const exportDsl = () => {
  let dslToExport = dslContent.value;
  
  if (isDesignerMode.value && designerRef.value) {
    // 从设计器获取最新的 rule
    const rule = designerRef.value.getRule();
    const option = designerRef.value.getOption();
    
    const dslObj = {
      dslVersion: '1.0',
      page: {
        id: 'example',
        title: '示例页面',
        rule,
        option
      },
      data: {}
    };
    
    dslToExport = JSON.stringify(dslObj, null, 2);
  }
  
  // 创建下载
  const blob = new Blob([dslToExport], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spark-dsl-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  ElMessage.success('DSL 已导出');
};

// 复制到剪贴板
const copyDsl = async () => {
  let dslToCopy = dslContent.value;
  
  if (isDesignerMode.value && designerRef.value) {
    const rule = designerRef.value.getRule();
    const option = designerRef.value.getOption();
    
    const dslObj = {
      dslVersion: '1.0',
      page: {
        id: 'example',
        title: '示例页面',
        rule,
        option
      },
      data: {}
    };
    
    dslToCopy = JSON.stringify(dslObj, null, 2);
  }
  
  try {
    await navigator.clipboard.writeText(dslToCopy);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    ElMessage.error('复制失败');
    console.error(error);
  }
};

// 数据绑定处理函数
function processDataBinding(rule: FormCreateRule[], data: Record<string, unknown>): FormCreateRule[] {
  return rule.map(item => {
    const newItem = { ...item };

    // 处理 children (字符串或数组)
    if (Array.isArray(newItem.children)) {
      if (typeof newItem.children[0] === 'string') {
        newItem.children = newItem.children.map(child => 
          typeof child === 'string' ? interpolate(child, data) : child
        );
      } else {
        newItem.children = processDataBinding(newItem.children as FormCreateRule[], data);
      }
    }

    // 处理 props
    if (newItem.props) {
      newItem.props = processObject(newItem.props, data);
    }

    // 处理 value
    if (typeof newItem.value === 'string') {
      newItem.value = interpolate(newItem.value, data);
    }

    return newItem;
  });
}

function processObject(obj: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolate(value, data);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processObject(value as Record<string, unknown>, data);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function interpolate(str: string, data: Record<string, unknown>): string {
  return str.replace(/\{\{\s*data\.(\w+)\s*\}\}/g, (_, key) => {
    return String(data[key] ?? '');
  });
}

// 监听设计器变化，实时更新预览
watch(() => designerRef.value, (designer) => {
  if (designer && isDesignerMode.value) {
    // 监听设计器变化
    const updatePreview = () => {
      try {
        if (designerRef.value) {
          currentRule.value = designerRef.value.getRule();
          currentOption.value = designerRef.value.getOption();
        }
      } catch (error) {
        console.error('Preview update error:', error);
      }
    };

    // 设置定时器监听变化
    const timer = setInterval(updatePreview, 500);
    
    // 清理
    return () => clearInterval(timer);
  }
}, { immediate: true });

// 组件挂载后注册自定义组件到设计器实例
onMounted(() => {
  console.log('🔧 [onMounted] 开始注册自定义组件到设计器实例...');
  console.log('📦 [onMounted] 待注册组件数量:', customLayoutComponents.length);
  
  // 等待 nextTick 确保设计器实例已创建
  nextTick(() => {
    if (designerRef.value && typeof designerRef.value.addComponent === 'function') {
      try {
        // 访问 dragRuleList（直接在顶层）
        const dragRuleList = (designerRef.value as any).dragRuleList;
        console.log('🔍 [调试] 注册前的 dragRuleList 键数量:', Object.keys(dragRuleList || {}).length);
        console.log('🔍 [调试] 注册前的 dragRuleList:', dragRuleList);
        
        // 逐个注册自定义组件到设计器菜单
        customLayoutComponents.forEach((component, index) => {
          console.log(`🔍 [${index}] 正在注册: ${component.label} (${component.name})`);
          designerRef.value.addComponent(component);
          console.log(`✅ [onMounted] 已注册: ${component.label}`);
        });
        
        console.log('✅ [onMounted] 所有自定义组件已注册到设计器菜单');
        
        // 再次检查 dragRuleList
        console.log('🔍 [调试] 注册后的 dragRuleList 键数量:', Object.keys(dragRuleList || {}).length);
        console.log('🔍 [调试] 注册后的 dragRuleList:', dragRuleList);
        
        // 检查每个组件是否在 dragRuleList 中
        customLayoutComponents.forEach(comp => {
          const exists = dragRuleList[comp.name];
          console.log(`🔍 [检查] ${comp.name} 在 dragRuleList 中:`, exists ? '✅ 存在' : '❌ 不存在', exists);
        });
        
        // 检查 menuList
        const menuList = (designerRef.value as any).menuList;
        console.log('🔍 [调试] menuList:', menuList);
        console.log('🔍 [调试] menuList 长度:', menuList.length);
        
        // 查找 layout 菜单项
        const layoutMenu = menuList.find((m: any) => m.name === 'layout');
        console.log('🔍 [调试] layout 菜单:', layoutMenu);
        if (layoutMenu) {
          console.log('🔍 [调试] layout 菜单的 list 长度:', layoutMenu.list?.length);
          console.log('🔍 [调试] layout 菜单的 list:', layoutMenu.list);
          
          // 检查我们的组件是否在 layout.list 中
          customLayoutComponents.forEach(comp => {
            const inList = layoutMenu.list?.find((item: any) => item.name === comp.name);
            console.log(`🔍 [检查] ${comp.name} 在 layout.list 中:`, inList ? '✅ 存在' : '❌ 不存在', inList);
          });
        }
      } catch (error) {
        console.error('❌ [onMounted] 注册自定义组件失败:', error);
      }
    } else {
      console.warn('⚠️ [onMounted] 设计器实例或 addComponent 方法不可用');
    }
  });
});

// 初始化：加载默认 DSL
handleDslUpdate();
</script>

<style scoped>
.dsl-editor-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.page-header {
  text-align: center;
  padding: 40px 20px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.page-header h1 {
  margin: 0 0 10px;
  font-size: 36px;
  font-weight: bold;
}

.page-header p {
  margin: 0;
  font-size: 16px;
  opacity: 0.9;
}

.editor-main {
  padding: 20px;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.preview-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-header {
  padding: 12px 16px;
  background: #f0f2f5;
  border-bottom: 1px solid #e4e7ed;
  font-size: 14px;
}

.preview-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}

/* 设计器模式 */
.designer-mode {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  height: calc(100vh - 250px);
}

.designer-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: auto;
}

/* 代码模式 */
.code-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  height: calc(100vh - 250px);
}

.editor-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* 模式切换器 */
.mode-switch {
  text-align: center;
  margin: 20px 0;
}

/* 操作栏 */
.action-bar {
  text-align: center;
  margin-top: 20px;
  padding: 20px;
}

/* 空状态 */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  font-size: 14px;
}

@media (max-width: 1024px) {
  .designer-mode,
  .code-mode {
    grid-template-columns: 1fr;
    height: auto;
  }
}
</style>
