import { blockLabel } from 'lib/editor-blocks';
import { buildInputRichMessage, validateRenderedPayloadLimits } from 'lib/editor-renderer';
import { isRtlLocale } from 'lib/i18n';
import { tutorialCopy } from 'lib/tutorial-copy';
import { advice, blockAt, clone, blockPaths, templateBlocks, TEMPLATE_IDS, TYPES, words } from 'lib/tutorial-model';

export function guideCallback(state,action) { return 'tut:'+state.epoch+':'+state.revision+':'+action; }
function inert(value) {
  if(Array.isArray(value))return value.map(inert);
  if(!value||typeof value!=='object')return value;
  if(value.type==='button')return String(value.button?.text||'');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,inert(item)]));
}
export function tutorialView(state,locale,entitlement,notice='') {
  const c=tutorialCopy(locale),w=(ar,en)=>words(locale,ar,en);
  const b=(text,action)=>({text,callback_data:guideCallback(state,action)});
  const richButton=(text,action)=>({type:'button',button:b(text,action)});
  const paragraph=text=>({type:'paragraph',text});
  let text=c.intro,rows=[],extra=[],preview=state.blocks||[];
  const back=()=>rows.push([b(c.back,'home')]);
  switch(state.step) {
    case 'home':
      rows=[[b(c.build,'build')],[b(c.templates,'templates'),b(c.all,'catalog')]];
      if(state.handedOff)extra.push(paragraph(w('هاي نسخة الدليل قبل الانتقال للمحرر. تعديلاتك اللاحقة بالمحرر تبقى هناك.','This is the guide snapshot from before the editor handoff. Later editor changes remain in the editor.')));
      if(preview.length)extra.push(paragraph([richButton(c.resume,'preview')]));
      preview=[];break;
    case 'build':text=c.choose;rows=[[b(c.heading,'add:heading')],[b(c.table,'add:table'),b(c.own,'choose')]];back();break;
    case 'catalog':case 'choose': {
      text=state.step==='catalog'?w('اختَر بلوكاً حتى تتعرّف عليه وتجرّبه داخل الدليل.','Choose a block to learn about it and try it in the guide.'):c.choose;
      const start=Math.min(state.listOffset||0,Math.max(0,TYPES.length-1));
      const buttons=TYPES.slice(start,start+8).map(type=>b(blockLabel(type,locale),(state.step==='catalog'?'inspect:':'add:')+type));
      for(let i=0;i<buttons.length;i+=2)rows.push(buttons.slice(i,i+2));
      rows.push([...(start?[b(c.previous,'list:'+Math.max(0,start-8))]:[]),...(start+8<TYPES.length?[b(c.next,'list:'+(start+8))]:[])]);
      back();break;
    }
    case 'inspect':
      preview=state.example?[state.example]:[];
      text=blockLabel(state.inspectType,locale)+' — '+inputHelp(state.inspectType,c);
      rows=[[b(w('أضيفه لمنشوري','Add it to my post'),'add:'+state.inspectType)],[b(c.all,'catalog')]];break;
    case 'input':
      text=blockLabel(state.pending.type,locale)+'\n'+inputHelp(state.pending.type,c);
      if(['slideshow','collage'].includes(state.pending.type)){
        rows.push([b(c.mediaDone,'mediaDone')]);
        const children=state.pending.children||[];
        text+='\n'+w('الوسائط المضافة: ','Media added: ')+children.length;
        if(children.length){
          preview=clone(preview);
          const draft={type:state.pending.type,position:preview.length,data:{children}};
          const target=state.pending.path!=null?blockAt(preview,state.pending.path):null;
          if(target)target.data={children};else preview.push(draft);
        }
      }
      rows.push([b(c.back,'preview')]);break;
    case 'preview':
      text=c.preview;rows=[[b(c.opinion,'advice'),b(c.own,'choose')],[b(c.edit,'edit'),b(c.done,'complete')]];
      if(state.undo)rows.push([b(c.undo,'undo')]);
      rows.push([b(c.home,'home'),b(c.exit,'pause')]);break;
    case 'advice': {
      const suggestion=advice(preview,locale);text=suggestion.text;
      if(suggestion.kind!=='none')rows.push([b(c.apply,'apply')]);
      rows.push([b(c.own,'choose'),b(c.back,'preview')]);break;
    }
    case 'templates':
      text=c.template;rows=TEMPLATE_IDS.map((id,i)=>[b(c.templateNames[i],'template:'+id)]);back();preview=[];break;
    case 'template':case 'replace':
      text=state.step==='replace'?c.replace:c.template;
      preview=templateBlocks(state.template,locale);
      rows=[[b(state.step==='replace'?c.confirm:c.use,state.step==='replace'?'replaceTemplate':'useTemplate')],[b(c.back,'templates')]];break;
    case 'edit': {
      text=c.select;
      const items=blockPaths(preview),offset=state.listOffset||0;
      rows=items.slice(offset,offset+8).map(({path,block})=>[b(path+' · '+blockLabel(block.type,locale),'edit:'+path)]);
      rows.push([...(offset?[b(c.previous,'list:'+Math.max(0,offset-8))]:[]),...(offset+8<items.length?[b(c.next,'list:'+(offset+8))]:[])]);
      rows.push([b(c.back,'preview')]);break;
    }
    case 'complete':
      text=c.complete;
      extra.push({type:'details',summary:c.more,blocks:[paragraph([richButton(c.save,'save')]),paragraph([richButton(c.cbd,'cbd')]),paragraph([richButton(c.guest,'guest')])]});
      rows=[[b(c.editor,'handoff')],[b(c.edit,'edit'),b(c.home,'home')]];break;
    case 'save':text=c.savePrompt;rows=[[b(c.back,'complete')]];break;
    case 'saved':
      text=c.saved;extra.push(paragraph({type:'code',text:state.pageId}));
      extra.push(paragraph({type:'button',button:{text:c.copy,copy_text:{text:state.pageId}}}));
      rows=[[b(c.cbd,'cbd'),b(c.guest,'guest')],[b(c.back,'complete')]];break;
    case 'cbd':case 'guest': {
      const saved=state.pageId&&!state.dirty;
      text=saved?(state.step==='cbd'?c.cbdText:c.guestText):c.needSave;
      if(saved){const code=state.step==='cbd'?'{'+w('افتح الصفحة','Open page')+' - CBD:'+state.pageId+' #b}':'@RichCustomizebot '+state.pageId;
        extra.push(paragraph({type:'code',text:code}),paragraph({type:'button',button:{text:c.copy,copy_text:{text:code}}}));}
      else rows.push([b(c.save,'save')]);
      if(saved && state.step==='cbd')extra.push(paragraph([richButton(w('جرّب فتح الصفحة هنا','Try opening the page here'),'trycbd')]));
      if(state.demoBlocks)preview=state.demoBlocks;
      rows.push([b(c.back,'complete')]);break;
    }
    case 'handoff':text=c.handoff;rows=[[b(c.openExisting,'existing')],[b(c.back,'complete')]];break;
    case 'paused':text=c.paused;rows=[[b(c.resume,'preview')],[b(c.home,'home')]];break;
    case 'save_retry':text=c.failed;rows=[[b(c.save,'retrySave')],[b(c.back,'complete')]];break;
    default:text=c.intro;rows=[[b(c.home,'home')]];
  }
  if(state.previewFailed){preview=[];rows.push([b(w('أعد تحميل المعاينة','Reload preview'),'refresh')]);notice=notice||w('تعذّر عرض الوسائط. محتوى منشورك محفوظ؛ تگدر تعيد المحاولة أو تختار قالباً آخر.','Media could not be displayed. Your draft is kept; retry or choose another layout.');}
  const header=[{type:'heading',size:2,text:c.entry},paragraph(text)];
  if(notice)header.push(paragraph(notice));
  let content=[];
  if(preview.length){
    // At most four root blocks per screen; keep the full draft untouched.
    const offset=Math.min(state.previewOffset||0,preview.length-1);
    let count=Math.min(4,preview.length-offset);
    while(count){
      content=inert(buildInputRichMessage(preview.slice(offset,offset+count),{userId:state.userId,entitlement})).blocks;
      try{validateRenderedPayloadLimits([...header,{type:'divider'},...content,{type:'divider'},...extra],{technicalOnly:true});break;}
      catch(error){if(count===1)throw error;count--;}
    }
    if(offset||count<preview.length){header.push(paragraph(c.partial+' '+(offset+1)+'–'+(offset+count)+' / '+preview.length));
      rows.push([...(offset?[b(c.previous,'previewOffset:'+Math.max(0,offset-4))]:[]),...(offset+count<preview.length?[b(c.next,'previewOffset:'+(offset+count))]:[])]);}
    content=[{type:'divider'},...content,{type:'divider'}];
  }
  const blocks=[...header,...content,...extra];
  validateRenderedPayloadLimits(blocks,{technicalOnly:true});
  return {rich_message:{blocks,...(isRtlLocale(locale)?{is_rtl:true}:{})},reply_markup:{inline_keyboard:rows.filter(row=>row.length)}};
}
function inputHelp(type,c) {
  if(type==='table')return c.tableInput;
  if(type==='list')return c.listInput;
  if(type==='details')return c.detailsInput;
  if(type==='map')return c.locationInput;
  if(['photo','video','animation','audio','voice','document','slideshow','collage'].includes(type))return c.mediaInput;
  return c.input;
}
