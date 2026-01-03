/**
 * SPARK.View + form-create 集成工具
 */

import formCreate from '@form-create/element-ui';
import { layoutComponents } from './layout-components';
import type { App } from 'vue';

/**
 * 注册自定义布局组件到 form-create
 */
export function registerLayoutComponents() {
  Object.entries(layoutComponents).forEach(([name, component]) => {
    formCreate.component(name, component);
  });
}

/**
 * 注册 Element Plus 组件到 form-create (使用别名)
 */
export function registerElementComponents() {
  // Element Plus 组件已经通过 @form-create/element-ui 注册
  // 这里可以添加自定义别名或包装组件
}

/**
 * 初始化 SPARK.View + form-create 环境
 */
export function setupSparkView(app: App) {
  // 注册 form-create
  app.use(formCreate);
  
  // 注册布局组件
  registerLayoutComponents();
  
  // 注册 Element 组件
  registerElementComponents();
}

/**
 * 使用 form-create 渲染 DSL rule
 */
export function renderRule(rule: unknown[], option: unknown = {}): unknown {
  return formCreate.create(rule as never, option as never);
}

export { formCreate };
