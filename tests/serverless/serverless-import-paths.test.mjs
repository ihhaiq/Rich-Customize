import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../tgcloud/', import.meta.url));

function* filesIn(directory) {
  for (const entry of readdirSync(directory, { withFileTypes:true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield path;
  }
}

test('Serverless named module imports omit .js; relative imports include it', () => {
  // The remote compiler accepts module names such as lib/foo (no extension),
  // or relative paths such as ./foo.js (extension required).
  for (const path of filesIn(sourceRoot)) {
    const source = readFileSync(path, 'utf8');
    const imports = [
      ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ];
    for (const match of imports) {
      const specifier = match[1];
      assert.equal(
        /^(?:lib\/[^'"]+|schema)\.js$/.test(specifier),
        false,
        path + ': named module imports must omit the .js suffix: ' + specifier,
      );
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        assert.ok(specifier.endsWith('.js'),
          path + ': relative imports must end in .js: ' + specifier);
      }
    }
  }
});
