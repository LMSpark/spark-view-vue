import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
// Fail if any file outside packages/spark-core imports the singletons `componentManager` or `componentRegistry` from the core package.
function walk(dir, files = []) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        if (entry === 'node_modules' || entry === 'dist')
            continue;
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory())
            walk(full, files);
        else
            files.push(full);
    }
    return files;
}
describe('forbidden singletons imports', () => {
    const root = path.resolve('.');
    const files = walk(root).filter(f => /\.(ts|js|tsx|jsx|vue)$/.test(f));
    const violations = [];
    const importPattern = /import\s+\{[^}]*\b(componentManager|componentRegistry)\b[^}]*\}\s+from\s+['"]@spark-view\/spark-core['"]/g;
    for (const file of files) {
        // skip files in packages/spark-core itself
        if (file.includes(path.join('packages', 'spark-core')))
            continue;
        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (importPattern.test(line)) {
                const found = (line.match(importPattern) || [line])[0];
                violations.push({ file: path.relative(root, file), line: i + 1, match: found });
            }
        }
    }
    it('no external file should import core singletons', () => {
        if (violations.length > 0) {
            const msg = violations.map(v => `${v.file}:${v.line} -> ${v.match}`).join('\n');
            throw new Error(`Found forbidden singleton imports:\n${msg}`);
        }
        expect(violations.length).toBe(0);
    });
});
