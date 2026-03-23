const fs = require('fs');
const src = fs.readFileSync('packages/spark-ai/src/component-props-catalog.ts','utf8');
const lines = src.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('"source": "vcm+override"') || lines[i].includes('"source": "override"')) {
    for (let j = i - 1; j >= Math.max(0, i - 500); j--) {
      const tm = lines[j].match(/"type":\s*"(r-[a-z-]+|context-aware-fields-api|builtin-action)"/);
      if (tm) {
        console.log(tm[1].padEnd(28) + lines[i].trim());
        break;
      }
    }
  }
}
