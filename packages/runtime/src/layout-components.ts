/**
 * SPARK.View 自定义布局组件
 * 用于 form-create 的页面布局
 */

import { defineComponent, h, type VNode } from 'vue';

/**
 * 规范化 children（处理 form-create 传入的 children 数组）
 */
function normalizeChildren(children: unknown): VNode[] | string | undefined {
  if (!children) return undefined;
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children as VNode[];
  return undefined;
}

/**
 * fc-container - 容器组件
 */
export const FcContainer = defineComponent({
  name: 'FcContainer',
  props: {
    class: String,
    style: [String, Object],
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: ['fc-container', props.class],
          style: props.style
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-header - 页头组件
 */
export const FcHeader = defineComponent({
  name: 'FcHeader',
  props: {
    class: String,
    style: [String, Object],
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    return () =>
      h(
        'header',
        {
          class: ['fc-header', props.class],
          style: props.style
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-footer - 页脚组件
 */
export const FcFooter = defineComponent({
  name: 'FcFooter',
  props: {
    class: String,
    style: [String, Object],
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    return () =>
      h(
        'footer',
        {
          class: ['fc-footer', props.class],
          style: props.style
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-section - 区块组件
 */
export const FcSection = defineComponent({
  name: 'FcSection',
  props: {
    class: String,
    style: [String, Object],
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          class: ['fc-section', props.class],
          style: props.style
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-hero - 英雄区块组件
 */
export const FcHero = defineComponent({
  name: 'FcHero',
  props: {
    class: String,
    style: [String, Object],
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: ['fc-hero', props.class],
          style: props.style
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-row - 行布局组件
 */
export const FcRow = defineComponent({
  name: 'FcRow',
  props: {
    class: String,
    style: [String, Object],
    gutter: Number,
    justify: String,
    align: String,
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    const styles = {
      display: 'flex',
      ...((props.justify && { justifyContent: props.justify }) || {}),
      ...((props.align && { alignItems: props.align }) || {}),
      ...((props.gutter && { gap: `${props.gutter}px` }) || {}),
      ...(typeof props.style === 'object' ? props.style : {})
    };

    return () =>
      h(
        'div',
        {
          class: ['fc-row', props.class],
          style: styles
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * fc-col - 列布局组件
 */
export const FcCol = defineComponent({
  name: 'FcCol',
  props: {
    class: String,
    style: [String, Object],
    span: {
      type: Number,
      default: 24
    },
    offset: Number,
    children: [Array, String],
    formCreateInject: Object
  },
  setup(props, { slots }) {
    const width = `${(props.span / 24) * 100}%`;
    const marginLeft = props.offset ? `${(props.offset / 24) * 100}%` : undefined;

    const styles = {
      width,
      ...((marginLeft && { marginLeft }) || {}),
      ...(typeof props.style === 'object' ? props.style : {})
    };

    return () =>
      h(
        'div',
        {
          class: ['fc-col', props.class],
          style: styles
        },
        normalizeChildren(props.children) || slots.default?.()
      );
  }
});

/**
 * 导出所有组件
 */
export const layoutComponents = {
  'fc-container': FcContainer,
  'fc-header': FcHeader,
  'fc-footer': FcFooter,
  'fc-section': FcSection,
  'fc-hero': FcHero,
  'fc-row': FcRow,
  'fc-col': FcCol
};
