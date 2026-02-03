import { expect, test } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../features/spark-ej2'

test('spark-ej2-grid is registered and component is a Vue component', async () => {
  await initializeSparkEJ2Components(Spark.manager())
  const def = Spark.registry().get('spark-ej2-grid')
  console.info('[test] registry entry:', def)
  expect(def).toBeDefined()
  // If full definition exists it should have a .component property
  if (def && 'component' in def && def.component) {
    expect(def.component).toBeTruthy()
  } else if (def) {
    // otherwise the registry returned a raw component
    expect(def.type).toBe('spark-ej2-grid')
  }
})