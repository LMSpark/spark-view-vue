/*
  简单基准脚本：测量 createComponentTree 对不同深度与宽度配置的构建时间
  结果会打印到控制台，供快速回归和优化参考
*/
import { getLogger } from '@/utils/spark/logger'
import { createSparkComponentTree } from '@/utils/spark/SparkComponentManager'

const logger = getLogger()

function generateConfig(depth, breadth) {
  const makeNode = (level) => {
    const node = { type: 'spark-ej2-column', headerText: `L${level}`, children: [] }
    if (level < depth) {
      for (let i = 0; i < breadth; i++) {
        node.children.push(makeNode(level + 1))
      }
    }
    return node
  }
  return makeNode(1)
}

function bench(depth, breadth, iterations = 20) {
  const config = generateConfig(depth, breadth)
  const times = []
  for (let i = 0; i < iterations; i++) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now()
    createSparkComponentTree(config)
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now()
    times.push(t1 - t0)
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length
  logger.info(`Depth=${depth} Breadth=${breadth} Iter=${iterations} Avg=${avg.toFixed(3)}ms`)
}

;(async () => {
  logger.info('Running createSparkComponentTree benchmark...')
  bench(3, 3)
  bench(5, 2)
  bench(6, 3)
  bench(8, 2)
})()
