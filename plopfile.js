export default function (plop) {
  // SPARK组件生成器
  plop.setGenerator('spark-component', {
    description: '创建一个新的SPARK组件',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '组件名称 (使用kebab-case，如: user-profile):',
        validate: function (value) {
          if ((/^[a-z][a-z0-9-]*$/).test(value)) {
            return true;
          }
          return '组件名称必须是kebab-case格式，只能包含小写字母、数字和连字符';
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '组件描述:'
      },
      {
        type: 'list',
        name: 'package',
        message: '选择目标包:',
        choices: [
          { name: 'spark-component (核心组件)', value: 'spark-component' }
        ]
      },
      {
        type: 'confirm',
        name: 'hasStories',
        message: '是否创建Storybook stories?',
        default: true
      },
      {
        type: 'confirm',
        name: 'hasTests',
        message: '是否创建单元测试?',
        default: true
      },
      {
        type: 'list',
        name: 'capabilityRole',
        message: '能力角色（组件是否提供 / 消费 SPARK 能力）：',
        choices: [
          { name: 'none     — 不涉及能力系统', value: 'none' },
          { name: 'provider — 向子组件提供能力', value: 'provider' },
          { name: 'consumer — 消费祖先提供的能力', value: 'consumer' },
          { name: 'both     — 既提供也消费', value: 'both' }
        ],
        default: 'none'
      },
      {
        type: 'list',
        name: 'dataBindingBehavior',
        message: 'DataViewKey行为（组件如何处理数据绑定）：',
        choices: [
          { name: 'none         — 不接入 DataSet', value: 'none' },
          { name: 'self-resolve — 自行消费 PAGE_DATASET', value: 'self-resolve' }
        ],
        default: 'none'
      }
    ],
    actions: function (data) {
      const basePath = `packages/${data.package}/src/components`;
      const componentName = data.name;
      const pascalName = componentName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      const SCREAMING_NAME = componentName.toUpperCase().replace(/-/g, '_');
      const isProvider = ['provider', 'both'].includes(data.capabilityRole);
      const isConsumer = ['consumer', 'both'].includes(data.capabilityRole);
      const isDataSelfResolve = data.dataBindingBehavior === 'self-resolve';

      /** 模板变量一并传递，确保所有 .hbs 模板均可访问 */
      const templateData = {
        name: componentName,
        pascalName,
        description: data.description,
        capabilityRole: data.capabilityRole,
        dataBindingBehavior: data.dataBindingBehavior,
        isProvider,
        isConsumer,
        isDataSelfResolve,
        SCREAMING_NAME,
      };

      const actions = [
        {
          type: 'add',
          path: `${basePath}/${componentName}.vue`,
          templateFile: 'plop-templates/component.vue.hbs',
          data: templateData
        },
        {
          type: 'add',
          path: `${basePath}/${componentName}.config.ts`,
          templateFile: 'plop-templates/component-config.ts.hbs',
          data: templateData
        }
      ];

      if (data.hasStories) {
        actions.push({
          type: 'add',
          path: `packages/${data.package}/stories/${pascalName}.stories.ts`,
          templateFile: 'plop-templates/component.stories.ts.hbs',
          data: templateData
        });
      }

      if (data.hasTests) {
        actions.push({
          type: 'add',
          path: `packages/${data.package}/tests/${componentName}.test.ts`,
          templateFile: 'plop-templates/component.test.ts.hbs',
          data: templateData
        });
      }

      return actions;
    }
  });
}
