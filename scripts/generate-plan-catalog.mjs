// Use npm run generate:plans after editing the trusted entitlement policy.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {PLAN_LIMITS, PLAN_PRICES_STARS, PLAN_PERIOD_DAYS} from '../tgcloud/lib/subscription-policy.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dest=resolve(root,'app/miniapp_static/plan_catalog.generated.js');
const catalog={limits:PLAN_LIMITS,prices:PLAN_PRICES_STARS,periodDays:PLAN_PERIOD_DAYS};
const output="// Generated from tgcloud/lib/subscription-policy.js. Do not edit by hand.\n"
  +"window.RichPlanCatalog = Object.freeze("+JSON.stringify(catalog,null,2)+");\n";
const existing=(()=>{try{return readFileSync(dest,'utf8')}catch{return''}})();
if(process.argv.includes('--check')){
  if(existing!==output){
    console.error('Plan catalog differs from subscription-policy.js. Run npm run generate:plans.');
    process.exitCode=1;
  }else console.log('Plan catalog matches trusted policy.');
}else{
  writeFileSync(dest,output);
  console.log('Generated miniapp plan catalog from trusted Serverless policy.');
}
