import { tutorialWords as words } from 'lib/tutorial-i18n';
import { makeBlock, textData, listData, tableData, mapData, normalizeBlocks, FINAL_RICH_BLOCK_TYPES } from 'lib/editor-blocks';
import { messageToBlocks } from 'lib/editor-import';

export const clone = value => JSON.parse(JSON.stringify(value));
export function orderBlocks(blocks) {
  blocks.forEach((block,index)=>{block.position=index;if(Array.isArray(block.data?.children))orderBlocks(block.data.children);});
  return normalizeBlocks(blocks);
}
export const TEMPLATE_IDS = ['heading_table', 'regular_post', 'announcement', 'task_list', 'recipe'];
export const TYPES = FINAL_RICH_BLOCK_TYPES;
export const RECIPE_IMAGES = [1, 2].map(n => 'https://rich-customize.pages.dev/tutorial-assets/recipe-' + n + '.png');
export { tutorialWords as words } from 'lib/tutorial-i18n';
export function textBlock(type, text, position = 0) { return makeBlock(type, textData({text}, type, 1), position); }
export function templateBlocks(id, locale = 'ar') {
  const w = (ar,en) => words(locale,ar,en);
  const heading = text => textBlock('heading', text);
  const divider = () => makeBlock('divider');
  const table = () => makeBlock('table', tableData(w('الخدمة | التفاصيل\nالتصميم | منشور مرتب\nالتواصل | راسلنا للمزيد','Service | Details\nDesign | A clear post\nContact | Ask us for details')));
  const tasks = () => makeBlock('list', listData(w('[x] تجهيز النص\n[x] اختيار التنسيق\n[ ] مراجعة المحتوى\n[ ] نشر المنشور','[x] Prepare the text\n[x] Choose the layout\n[ ] Review the content\n[ ] Publish the post'), 'checklist'));
  let blocks;
  if (id === 'heading_table') blocks = [heading(w('خدماتنا','Our services')), table()];
  if (id === 'regular_post') blocks = [heading(w('خبر جديد لقناتنا','News for our channel')), divider(), textBlock('paragraph',w('اكتب هنا رسالتك ووضّح الفكرة للمتابعين.','Write your message here and explain your idea.')),textBlock('footer',w('شكراً لمتابعتكم','Thank you for following'))];
  if (id === 'announcement') blocks = [heading(w('إعلان جديد','New announcement')),divider(),table(),makeBlock('details',{summary_text:w('تفاصيل الإعلان','Announcement details'),children:[tasks()]})];
  if (id === 'task_list') blocks = [heading(w('مهام اليوم','Today’s tasks')),tasks()];
  if (id === 'recipe') blocks = [heading(w('دجاج مشوي مع البطاطا 🍖','Grilled chicken and potatoes 🍖')),divider(),makeBlock('slideshow',{children:RECIPE_IMAGES.map((file_id,position)=>makeBlock('photo',{file:{file_id}},position))})];
  if (!blocks) throw new Error('TUTORIAL_TEMPLATE_INVALID');
  orderBlocks(blocks); return blocks;
}
export function advice(blocks, locale) {
  const w=(ar,en)=>words(locale,ar,en);
  const tableIndex=blocks.findIndex(b=>b.type==='table');
  if(tableIndex>=0 && !blocks.slice(tableIndex+1).some(b=>b.type==='details')) return {kind:'table',text:w('أقترح تفاصيل تحت الجدول، ويا فاصلة تفصلها عنه. هيچ تعرض الأرقام أولاً والشرح بعدها.','Add details below the table, separated by a divider, to keep the explanation easy to find.')};
  if(blocks.some(b=>b.type==='heading') && !blocks.some(b=>b.type==='footer')) return {kind:'heading',text:w('أقترح فاصلة وتذييل حتى ترتّب نهاية المنشور. وإذا العنوان وحده، تگدر تضيف فقرة أو جدول للمحتوى.','Add a divider and footer to finish the post. If you only have a heading, add a paragraph or table for the content.')};
  return {kind:'none',text:w('التنسيق مرتب. راجع النصوص، أو اختَر بلوكاً ثاني إذا تحتاج تضيف محتوى.','The layout is ready. Review the text or choose another block if you need more content.')};
}
export function applyAdvice(blocks, locale) {
  const result=clone(blocks), suggestion=advice(result,locale);
  if(suggestion.kind==='table') {
    const i=result.findIndex(b=>b.type==='table')+1;
    const addition=[];
    if(result[i]?.type!=='divider') addition.push(makeBlock('divider'));
    addition.push(makeBlock('details',{summary_text:words(locale,'تفاصيل إضافية','More details'),children:[textBlock('paragraph',words(locale,'اكتب شرح الجدول هنا.','Explain the table here.'))]}));
    result.splice(result[i]?.type==='divider'?i+1:i,0,...addition);
  } else if(suggestion.kind==='heading') {
    if(result.at(-1)?.type!=='divider') result.push(makeBlock('divider'));
    result.push(textBlock('footer',words(locale,'اكتب ملاحظتك الأخيرة هنا.','Write your closing note here.')));
  }
  orderBlocks(result); return result;
}
export function blockAt(blocks,path) {
  const parts=String(path).split('.').map(Number);let items=blocks,node;
  for(const index of parts){if(!Number.isInteger(index)||index<0)return null;node=items?.[index];items=node?.data?.children;}
  return node||null;
}
export function blockPaths(blocks,prefix='') {
  return blocks.flatMap((block,index)=>{
    const path=prefix+index;
    return [{path,block},...(Array.isArray(block.data?.children)?blockPaths(block.data.children,path+'.'):[])];
  });
}
export function fromInput(message,type,previous=null) {
  const text=String(message.text||'').trim();
  if(['photo','video','audio','voice','animation','document'].includes(type)) {
    const block=messageToBlocks(message).find(b=>b.type===type);
    if(!block)throw new Error('TUTORIAL_INPUT');return block;
  }
  if(type==='slideshow'||type==='collage') {
    const children=messageToBlocks(message).filter(b=>['photo','video'].includes(b.type));
    if(!children.length)throw new Error('TUTORIAL_MEDIA');
    return makeBlock(type,{children});
  }
  if(type==='map') {
    if(!message.location)throw new Error('TUTORIAL_LOCATION');
    return makeBlock(type,mapData(message.location.latitude,message.location.longitude));
  }
  if(type==='divider')return makeBlock('divider');
  if(!text)throw new Error('TUTORIAL_INPUT');
  if(type==='details')return makeBlock(type,{summary_text:text,children:previous?.data?.children||[textBlock('paragraph',words(message.from?.language_code,'اكتب التفاصيل هنا.','Write the details here.'))]});
  if(type==='blockquote'||type==='pullquote')return makeBlock(type,{quote_text:text});
  if(!TYPES.includes(type))throw new Error('TUTORIAL_INPUT');
  return makeBlock(type,textData(message,type,previous?.data?.size||1,null,null,previous?.data?.kind||'checklist'));
}

export function exampleBlock(type,locale,library={}) {
  const w=(ar,en)=>words(locale,ar,en);
  if(type==='table')return templateBlocks('heading_table',locale)[1];
  if(type==='list')return templateBlocks('task_list',locale)[1];
  if(type==='details')return templateBlocks('announcement',locale)[3];
  if(type==='slideshow'||type==='collage'){const block=templateBlocks('recipe',locale)[2];block.type=type;return block;}
  if(type==='photo')return makeBlock('photo',{file:{file_id:RECIPE_IMAGES[0]}});
  if(['video','audio','voice','animation','document'].includes(type)){
    const file_id=library[type]?.[0];return file_id?makeBlock(type,{file:{file_id}}):null;
  }
  if(type==='map')return makeBlock('map',mapData(33.3152,44.3661));
  if(type==='divider')return makeBlock('divider');
  if(type==='blockquote'||type==='pullquote')return makeBlock(type,{quote_text:w('فكرة واضحة توصل أسرع.','A clear idea is easier to share.'),credit_text:w('مثال','Example')});
  if(type==='mathematical_expression')return textBlock(type,'E = mc^2');
  if(type==='anchor')return textBlock(type,'section');
  if(type==='preformatted')return textBlock(type,'Hello, world!');
  return textBlock(type,w('هذا مثال، تگدر تضيف نصّك بداله.','This is an example. Replace it with your own text.'));
}
