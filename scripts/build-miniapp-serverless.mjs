import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(root, 'app', 'miniapp_static');
const output = resolve(root, '.tgcloud-miniapp-static');
const relativeOutput = relative(root, output);

if (!relativeOutput || relativeOutput.startsWith('..' + sep) || relativeOutput === '..') {
  throw new Error('Refusing to build Mini App outside the repository.');
}

await rm(output, {recursive:true,force:true});
await mkdir(output, {recursive:true});
await cp(source, output, {recursive:true});
await rm(resolve(output, '_redirects'), {force:true});

async function rewriteStaticAssetPaths(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteStaticAssetPaths(path);
      continue;
    }
    if (!/\.(?:html|css|js|json)$/i.test(entry.name)) continue;
    const original = await readFile(path, 'utf8');
    const updated = original.replaceAll('/miniapp/static/', '/');
    if (updated !== original) await writeFile(path, updated, 'utf8');
  }
}

await rewriteStaticAssetPaths(output);
console.log('Built Telegram Serverless Mini App static files.');
