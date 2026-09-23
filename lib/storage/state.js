import { db } from 'sdk';
import { eq } from 'sdk/db';
import { richState } from 'schema';

function nowSeconds(){ return Math.floor(Date.now()/1000); }
function clone(value){ return value==null?value:JSON.parse(JSON.stringify(value)); }

export async function readState(namespace,fallback={}){
  const row=await db.select().from(richState).where(eq(richState.namespace,String(namespace))).get();
  return row?.payload==null?clone(fallback):clone(row.payload);
}
export async function writeState(namespace,payload){
  const value=clone(payload);
  await db.insert(richState).values({namespace:String(namespace),payload:value,updatedAt:nowSeconds()})
    .onConflictDoUpdate({target:richState.namespace,set:{payload:value,updatedAt:nowSeconds()}}).run();
  return value;
}
export async function updateState(namespace,mutator,fallback={}){
  const current=await readState(namespace,fallback);
  const next=await mutator(current)??current;
  await writeState(namespace,next);
  return next;
}
export async function deleteState(namespace){
  await db.delete(richState).where(eq(richState.namespace,String(namespace))).run();
}
