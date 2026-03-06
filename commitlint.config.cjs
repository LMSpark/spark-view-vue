module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['deps', 'docs', 'scripts', 'spark-data', 'spark-app', 'spark-component', 'spark-utils', 'spark-page-config']],
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always']
  }
}
