import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'../../tgcloud');
function collect(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=path.join(dir,entry.name);
    return entry.isDirectory()?collect(p):p.endsWith('.js')?[p]:[];
  });
}
const scripts=collect(root);
test('all Telegram Serverless modules have syntactically valid JavaScript',()=>{
  for(const p of scripts){
    assert.doesNotThrow(()=>new vm.SourceTextModule(fs.readFileSync(p,'utf8')),{message:path.relative(root,p)});
  }
});
test('every logError call uses a declared import or lives in the logger itself',()=>{
  for(const p of scripts){
    const relative=path.relative(root,p).replaceAll('\\','/');
    if(relative==='lib/error-log.js')continue;
    const content=fs.readFileSync(p,'utf8');
    if(!/\blogError\s*\(/.test(content))continue;
    assert.match(content,/import\s*\{[^}]*\blogError\b[^}]*\}\s*from\s*['"]lib\/error-log['"]/s,relative);
  }
});
test('all local module aliases imported from lib exist',()=>{
  for(const p of scripts){
    const content=fs.readFileSync(p,'utf8');
    for(const match of content.matchAll(/from\s*['"]lib\/([^'"]+)['"]/g)){
      const target=path.join(root,'lib',match[1]+'.js');
      assert.ok(fs.existsSync(target),path.relative(root,p)+': missing '+match[1]);
    }
  }
});
