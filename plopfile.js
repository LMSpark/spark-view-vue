export default function (plop) {
  // 测试生成器
  plop.setGenerator('test-component', {
    description: '创建一个测试组件',
    prompts: [],
    actions: [
      {
        type: 'add',
        path: 'test-output.txt',
        template: '测试组件生成成功！\n时间: {{date}}\n版本: {{version}}',
        data: {
          date: new Date().toISOString(),
          version: '1.0.0'
        }
      }
    ]
  });

  // 示例组件生成器（非交互式）
  plop.setGenerator('example-component', {
    description: '创建一个示例SPARK组件',
    prompts: [],
    actions: function() {
      const componentName = 'example-card';
      const pascalName = 'ExampleCard';
      const camelName = 'exampleCard';

      return [
        {
          type: 'add',
          path: `packages/spark-component/src/components/${componentName}.vue`,
          templateFile: 'plop-templates/component.vue.hbs',
          data: {
            name: componentName,
            pascalName: pascalName,
            description: '一个示例卡片组件'
          }
        },
        {
          type: 'add',
          path: `packages/spark-component/src/components/${componentName}.ts`,
          templateFile: 'plop-templates/component-config.ts.hbs',
          data: {
            name: componentName,
            pascalName: pascalName,
            camelName: camelName,
            description: '一个示例卡片组件'
          }
        },
        {
          type: 'add',
          path: `packages/spark-component/stories/${pascalName}.stories.ts`,
          templateFile: 'plop-templates/component.stories.ts.hbs',
          data: {
            name: componentName,
            pascalName: pascalName,
            description: '一个示例卡片组件'
          }
        },
        {
          type: 'add',
          path: `packages/spark-component/tests/${componentName}.test.ts`,
          templateFile: 'plop-templates/component.test.ts.hbs',
          data: {
            name: componentName,
            pascalName: pascalName,
            description: '一个示例卡片组件'
          }
        }
      ];
    }
  });

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
        name: 'dataKeyBehavior',
        message: 'DataKey 行为（组件如何处理数据绑定）：',
        choices: [
          { name: 'none         — 不接入 DataSet', value: 'none' },
          { name: 'self-resolve — 自行消费 PAGE_DATASET', value: 'self-resolve' },
          { name: 'injected     — 由 bindRules 外部注入', value: 'injected' }
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
      const isDataSelfResolve = data.dataKeyBehavior === 'self-resolve';

      /** 模板变量一并传递，确保所有 .hbs 模板均可访问 */
      const templateData = {
        name: componentName,
        pascalName,
        description: data.description,
        capabilityRole: data.capabilityRole,
        dataKeyBehavior: data.dataKeyBehavior,
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

  // SPARK 能力生成器
  plop.setGenerator('spark-capability', {
    description: '创建新的 SPARK 能力（将接口 + 能力键一并添加到 symbols.ts）',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '能力键名称 (SCREAMING_SNAKE_CASE，如: USER_DATA):',
        validate: function (value) {
          if ((/^[A-Z][A-Z0-9_]*$/).test(value)) {
            return true;
          }
          return '能力键必须为 SCREAMING_SNAKE_CASE 格式';
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '能力描述:'
      },
      {
        type: 'input',
        name: 'interfaceName',
        message: 'TypeScript 接口名称 (以 I 开头 PascalCase，如: IUserDataCapability):',
        validate: function (value) {
          if ((/^I[A-Z][a-zA-Z0-9]*$/).test(value)) {
            return true;
          }
          return '接口名称必须以 I 开头且采用 PascalCase 格式';
        }
      }
    ],
    actions: function (data) {
      // 将 SCREAMING_SNAKE_CASE 转换为 kebab-case，用于能力键字符串
      const kebabName = data.name.toLowerCase().replace(/_/g, '-');
      const capabilityData = {
        name: data.name,
        description: data.description,
        interfaceName: data.interfaceName,
        kebabName,
      };

      return [
        {
          // 将接口定义 + 能力键一并添加到 symbols.ts 拓展点
          type: 'append',
          path: 'packages/spark-utils/src/capability/symbols.ts',
          pattern: '// === 业务能力扩展点（plop spark-capability 生成的自定义能力在此追加） ===',
          templateFile: 'plop-templates/capability-symbol.ts.hbs',
          separator: '\n',
          data: capabilityData
        }
      ];
    }
  });
}