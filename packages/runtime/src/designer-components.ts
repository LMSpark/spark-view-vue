/**
 * 自定义布局组件的设计器配置
 * 按照 @form-create/designer 官方规范定义
 * 参考: https://github.com/xaboy/form-create-designer
 */

/**
 * DragRule 接口定义
 * 参考官方文档: https://view.form-create.com/component
 */
export interface DragRule {
  // 组件图标
  icon: string;
  // 组件显示名称  
  label: string;
  // 组件唯一标识
  name: string;
  // 所属菜单分类
  menu: 'main' | 'aide' | 'layout' | 'subform';
  // 是否为输入组件
  input?: boolean;
  // 生成组件规则的函数
  rule: (() => any) | ((arg: { t: (key: string) => string }) => any);
  // 组件属性配置
  props?: (rule: any, arg: { t: (key: string) => string; api: any }) => any[];
  // 是否可以向内部拖入组件
  drag?: boolean | string;
  // 组件操作按钮是否在内部
  inside?: boolean;
  // 是否显示遮罩
  mask?: boolean;
}

/**
 * fc-container 容器组件
 */
const fcContainer: DragRule = {
  icon: 'icon-container',
  label: '容器',
  name: 'fc-container',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-container',
      props: {
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-header 头部组件
 */
const fcHeader: DragRule = {
  icon: 'icon-header',
  label: '头部',
  name: 'fc-header',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-header',
      props: {
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-footer 底部组件
 */
const fcFooter: DragRule = {
  icon: 'icon-footer',
  label: '底部',
  name: 'fc-footer',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-footer',
      props: {
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-section 区块组件
 */
const fcSection: DragRule = {
  icon: 'icon-section',
  label: '区块',
  name: 'fc-section',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-section',
      props: {
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-hero 英雄区组件
 */
const fcHero: DragRule = {
  icon: 'icon-hero',
  label: '英雄区',
  name: 'fc-hero',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-hero',
      props: {
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-row 行布局组件
 */
const fcRow: DragRule = {
  icon: 'icon-row',
  label: '行布局',
  name: 'fc-row',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-row',
      props: {
        gutter: 0,
        justify: 'start',
        align: 'top',
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'inputNumber',
        field: 'gutter',
        title: '栅格间隔',
        value: 0
      },
      {
        type: 'select',
        field: 'justify',
        title: '水平排列',
        value: 'start',
        options: [
          { label: '左对齐', value: 'start' },
          { label: '居中', value: 'center' },
          { label: '右对齐', value: 'end' },
          { label: '两端对齐', value: 'space-between' },
          { label: '均匀分布', value: 'space-around' }
        ]
      },
      {
        type: 'select',
        field: 'align',
        title: '垂直对齐',
        value: 'top',
        options: [
          { label: '顶部', value: 'top' },
          { label: '居中', value: 'middle' },
          { label: '底部', value: 'bottom' }
        ]
      },
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * fc-col 列布局组件
 */
const fcCol: DragRule = {
  icon: 'icon-col',
  label: '列布局',
  name: 'fc-col',
  menu: 'layout',
  drag: true,
  inside: true,
  mask: false,
  rule() {
    return {
      type: 'fc-col',
      props: {
        span: 12,
        offset: 0,
        class: '',
        style: {}
      },
      children: []
    };
  },
  props(_, { t }) {
    return [
      {
        type: 'slider',
        field: 'span',
        title: '栅格占据列数',
        value: 12,
        props: { min: 1, max: 24 }
      },
      {
        type: 'slider',
        field: 'offset',
        title: '栅格左侧间隔',
        value: 0,
        props: { min: 0, max: 24 }
      },
      {
        type: 'input',
        field: 'class',
        title: 'CSS 类名'
      }
    ];
  }
};

/**
 * 所有自定义布局组件配置
 */
export const customLayoutComponents: DragRule[] = [
  fcContainer,
  fcHeader,
  fcFooter,
  fcSection,
  fcHero,
  fcRow,
  fcCol
];

// 不再需要 generateDesignerMenu
// 使用官方的 FcDesigner.addComponent() API
// 组件会根据 menu 字段自动添加到对应分类
