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
          { name: 'spark-component (核心组件)', value: 'spark-component' },
          { name: 'spark-business (业务组件)', value: 'spark-business' },
          { name: 'spark-renderer (渲染组件)', value: 'spark-renderer' }
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
      }
    ],
    actions: function (data) {
      const basePath = `packages/${data.package}/src/components`;
      const componentName = data.name;
      const pascalName = componentName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

      const actions = [
        {
          type: 'add',
          path: `${basePath}/${componentName}.vue`,
          templateFile: 'plop-templates/component.vue.hbs'
        },
        {
          type: 'add',
          path: `${basePath}/${componentName}.ts`,
          templateFile: 'plop-templates/component-config.ts.hbs'
        }
      ];

      if (data.hasStories) {
        actions.push({
          type: 'add',
          path: `packages/${data.package}/stories/${pascalName}.stories.ts`,
          templateFile: 'plop-templates/component.stories.ts.hbs'
        });
      }

      if (data.hasTests) {
        actions.push({
          type: 'add',
          path: `packages/${data.package}/tests/${componentName}.test.ts`,
          templateFile: 'plop-templates/component.test.ts.hbs'
        });
      }

      return actions;
    }
  });

  // SPARK能力生成器
  plop.setGenerator('spark-capability', {
    description: '创建一个新的SPARK能力定义',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: '能力名称 (使用SCREAMING_SNAKE_CASE，如: USER_DATA):',
        validate: function (value) {
          if ((/^[A-Z][A-Z0-9_]*$/).test(value)) {
            return true;
          }
          return '能力名称必须是SCREAMING_SNAKE_CASE格式';
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
        message: 'TypeScript接口名称 (如: IUserDataService):',
        validate: function (value) {
          if ((/^I[A-Z][a-zA-Z0-9]*$/).test(value)) {
            return true;
          }
          return '接口名称必须以I开头，采用PascalCase格式';
        }
      }
    ],
    actions: [
      {
        type: 'append',
        path: 'packages/spark-utils/src/capability/types.ts',
        pattern: '// 新能力接口定义在这里',
        templateFile: 'plop-templates/capability-interface.ts.hbs'
      },
      {
        type: 'append',
        path: 'packages/spark-utils/src/capability/symbols.ts',
        pattern: '// 新能力符号定义在这里',
        templateFile: 'plop-templates/capability-symbol.ts.hbs'
      }
    ]
  });
}