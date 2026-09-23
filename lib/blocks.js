import {
  addBlock,addChild,childBlocks,deleteBlock,deleteChild,duplicateBlock,getBlockById,
  moveBlock,moveChild,normalizeBlockPositions,replaceBlock,replaceBlockData,replaceChild,
} from 'lib/editor/document';
import { t } from 'lib/i18n';

export const BLOCK_LABEL_KEYS={
  text:'block.text',paragraph:'block.paragraph',heading:'block.heading',preformatted:'block.preformatted',
  footer:'block.footer',caption:'block.caption',photo:'block.photo',video:'block.video',
  animation:'block.animation',audio:'block.audio',voice:'block.voice',document:'block.document',
  sticker:'block.sticker',video_note:'block.video_note',divider:'block.divider',list:'block.list',
  table:'block.table',blockquote:'block.blockquote',pullquote:'block.pullquote',details:'block.details',
  mathematical_expression:'block.mathematical_expression',anchor:'block.anchor',collage:'block.collage',
  slideshow:'block.slideshow',map:'block.map',buttons:'block.buttons',
};
export function getBlockLabel(type,language='en'){ return t(BLOCK_LABEL_KEYS[type]??'block.content',{language}); }
export function getBlockButtonText(block,index,language='en'){ return getBlockLabel(String(block?.type??''),language)+' #'+(index+1); }
export function updateBlock(blocks,id,data){ return replaceBlockData(blocks,id,data)!=null; }
function plain(v){ if(v==null)return''; if(typeof v==='string')return v; if(Array.isArray(v))return v.map(plain).join(''); if(v&&typeof v==='object'){if(v.type==='custom_emoji')return String(v.alternative_text??''); return plain(v.text??v.children??'');} return String(v); }
function editableRows(rows){ return JSON.parse(JSON.stringify(rows??[])).map(row=>Array.isArray(row)?row.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw; if(raw.text&&typeof raw.text==='object'){raw.rich_text=JSON.parse(JSON.stringify(raw.text));raw.text=plain(raw.text);}return raw;}):row); }
export function tableRows(block){ if(block?.type!=='table')return[]; const d=block.data??{}; if(Array.isArray(d.rows))return d.rows; return Array.isArray(d.native_data?.cells)?d.native_data.cells:[]; }
export function editableTableData(block){ if(block?.type!=='table')return null; const old=block.data??={},rows=editableRows(tableRows(block)); if(!rows.length)return null; const native=old.native_data&&typeof old.native_data==='object'?old.native_data:{}; const data={...Object.fromEntries(Object.entries(old).filter(([k])=>!['native','native_data','native_type','html','rows'].includes(k))),rows,is_bordered:old.is_bordered??native.is_bordered??true,is_striped:old.is_striped??native.is_striped??false,is_compact:old.is_compact??native.is_compact??false,caption_rich_text:old.caption_rich_text??native.caption??null}; block.source='generated';block.data=data;return data; }
export function tableFlag(block,field){ const d=block?.data??{},n=d.native_data&&typeof d.native_data==='object'?d.native_data:{}; return Boolean(d[field]??n[field]??(field==='is_bordered')); }
export function setTableCellStyle(block,row,column,{shaded=null,centered=null}={}){ const data=editableTableData(block); if(!data||row<0||row>=data.rows.length||column<0||column>=data.rows[row].length)return false; const raw=data.rows[row][column],cell=raw&&typeof raw==='object'&&!Array.isArray(raw)?{...raw}:{text:String(raw??'')}; if(shaded!=null)cell.is_header=Boolean(shaded); if(centered!=null){if(centered){if(cell.align!=='center')cell._previous_align=cell.align??'left';cell.align='center';}else cell.align=cell._previous_align??'left';delete cell._previous_align;} cell.valign??='middle'; data.rows[row][column]=cell;return true; }
export function setAllTableCellsStyle(block,options={}){ const data=editableTableData(block); if(!data)return false; let changed=false; for(let r=0;r<data.rows.length;r++)for(let c=0;c<data.rows[r].length;c++)changed=setTableCellStyle(block,r,c,options)||changed; return changed; }
export {addBlock,addChild,childBlocks,deleteBlock,deleteChild,duplicateBlock,getBlockById,moveBlock,moveChild,normalizeBlockPositions,replaceBlock,replaceBlockData,replaceChild};
