import { makeBlock } from 'lib/editor/models';
import { editorWorkflow } from 'lib/editor/workflow';
export const DETAILS_TYPE='details';
function emptyChild(){ return makeBlock('paragraph',{text:'…',html:'<p>…</p>'},{position:0}); }
export function detailsChildren(details){ details.data??={}; if(!Array.isArray(details.data.children))details.data.children=[]; details.data.children.sort((a,b)=>Number(a.position??0)-Number(b.position??0)); details.data.children.forEach((c,i)=>c.position=i); return details.data.children; }
export function findDetailsChild(details,id){ return detailsChildren(details).find(c=>c?.id===id)??null; }
export function detachNativeDetails(details){details.data??={};details.source='generated';details.data.native=false;delete details.data.native_data;delete details.data.native_type;delete details.data.html;}
export function replaceDetailsChildren(details,children){let normalized=[];for(const child of children??[])normalized=editorWorkflow.add(normalized,child).blocks;if(!normalized.length)normalized=[emptyChild()];detachNativeDetails(details);details.data.children=normalized;}
export function addDetailsChild(details,child,{index=null}={}){const r=editorWorkflow.add(detailsChildren(details),child,{index});detachNativeDetails(details);details.data.children=r.blocks;return r.block;}
export function deleteDetailsChild(details,id){const r=editorWorkflow.delete(detailsChildren(details),id);if(r.changed){detachNativeDetails(details);details.data.children=r.blocks.length?r.blocks:[emptyChild()];}return r.changed;}
export function moveDetailsChild(details,id,index){const r=editorWorkflow.move(detailsChildren(details),id,index);if(r.changed){detachNativeDetails(details);details.data.children=r.blocks;}return r.changed;}
export function replaceDetailsChild(details,id,replacement){const r=editorWorkflow.replace(detailsChildren(details),id,replacement);if(!r.changed)return null;detachNativeDetails(details);details.data.children=r.blocks;return r.block;}
