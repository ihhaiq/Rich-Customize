// Fast build-time checks for the source-of-truth Mini App entry page.
// This is a static guard, not a substitute for real Android WebView testing.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=resolve(root,'app/miniapp_static');
const html=readFileSync(resolve(folder,'editor.html'),'utf8');
const app=readFileSync(resolve(folder,'app.js'),'utf8');
const live=readFileSync(resolve(folder,'live_preview.js'),'utf8');
const failures=[];
const assets=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="\/miniapp\/static\/([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
for(const asset of assets){
  if(!existsSync(resolve(folder,asset)))failures.push('Missing Mini App asset: '+asset);
}
const duplicates=assets.filter((asset,index)=>assets.indexOf(asset)!==index);
if(duplicates.length)failures.push('Duplicated Mini App assets: '+[...new Set(duplicates)].join(', '));
const position=name=>assets.indexOf(name);
if(position('plan_catalog.generated.js')<0||
  position('plan_catalog.generated.js')>position('subscription_offers.js'))
  failures.push('Plan catalog must load before subscription offers.');
if(position('app.js')<0||position('live_preview.js')<position('app.js'))
  failures.push('Core app must load before registered Rich renderers.');
if(!/RichLiveRenderer\?\.render/.test(app)||!/RichLiveRenderer\?\.table/.test(app))
  failures.push('Core renderBlocks and tableEditor must delegate to RichLiveRenderer.');
if(/\brenderBlocks\s*=\s*function/.test(live)||/\btableEditor\s*=\s*enhancedTableEditor/.test(live))
  failures.push('Rich renderer must register handlers instead of replacing global functions.');
if(!/RichLiveRenderer\.render=renderRichBlocks/.test(live)||!/RichLiveRenderer\.table=enhancedTableEditor/.test(live))
  failures.push('Rich renderer registration is missing.');
for(const file of assets.filter(asset=>asset.endsWith('.js'))){
  // Catch syntax regressions in standalone browser scripts without importing.
  try{new vm.Script(readFileSync(resolve(folder,file),'utf8'),{filename:file})}
  catch(error){failures.push('JS syntax '+file+': '+error.message)}
}
if(failures.length){
  for(const error of failures)console.error('ERROR: '+error);
  process.exitCode=1;
}else{
  console.log('Mini App static assets, render contracts and JS syntax OK ('+assets.length+' assets).');
}
