export const MEDIA_TYPES=new Set(['photo','video','animation','audio','voice','document','sticker','video_note']);
export const MEDIA_NATIVE_FIELDS={photo:'photo',video:'video',animation:'animation',audio:'audio',document:'document',voice:'voice_note',sticker:'sticker',video_note:'video_note'};
function asFileDict(value){ if(Array.isArray(value)) value=[...value].reverse().find(x=>x&&typeof x==='object'); if(!value||typeof value!=='object'||!value.file_id) return null; return {...value,file_id:String(value.file_id)}; }
export function nativeFileData(raw,blockType){ const field=MEDIA_NATIVE_FIELDS[blockType]; return field?asFileDict(raw?.[field]):null; }
export function fileData(block){ const direct=asFileDict(block?.data?.file); if(direct) return direct; const native=block?.data?.native_data; return native&&typeof native==='object'?nativeFileData(native,String(block?.type??'')):null; }
export function fileId(block){ return fileData(block)?.file_id??null; }
export function* iterMediaBlocks(blocks){ for(const block of blocks??[]){ if(!block||typeof block!=='object'||Array.isArray(block)) continue; if(MEDIA_TYPES.has(block.type)) yield block; const data=block.data??{}; for(const key of ['children','media_children']) if(Array.isArray(data[key])) yield* iterMediaBlocks(data[key]); } }
