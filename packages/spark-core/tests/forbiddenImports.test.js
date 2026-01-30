import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
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
describe('packages/spark-core: forbidden imports', () => {
    var _a, _b;
    const root = path.resolve(__dirname, '..'); // packages/spark-core
    const files = walk(root)
        .filter(f => /\.(ts|js|tsx|jsx|md|json)$/.test(f));
    const matches = [];
    const vueImportRegex = /import\s+[^'"\n]+from\s+['"][^'"]+\.vue['"]/g;
    const requireVueRegex = /require\(['"][^'"]+\.vue['"]\)/g;
    const featuresPathRegex = /from\s+['"][^'"]*features\//g;
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (vueImportRegex.test(line) || requireVueRegex.test(line) || featuresPathRegex.test(line)) {
                const found = (_b = (_a = (line.match(vueImportRegex) || line.match(requireVueRegex) || line.match(featuresPathRegex))) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : line;
                matches.push({ file: path.relative(root, file), line: i + 1, match: found });
            }
        }
    }
    it('should not contain imports of .vue files or references to features/', () => {
        if (matches.length > 0) {
            const msg = matches.map(m => `${m.file}:${m.line} -> ${m.match}`).join('\n');
            throw new Error(`Found forbidden imports in packages/spark-core:\n${msg}`);
        }
        expect(matches.length).toBe(0);
    });
});
