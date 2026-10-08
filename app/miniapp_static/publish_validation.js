/* Shared pure pre-publish validation: drafts may remain incomplete, publishing cannot. */
(function(root) {
  'use strict';
  const media=new Set(['photo','video','animation','audio','voice','voice_note','document']);
  const text=new Set(['paragraph','text','caption','heading','footer','preformatted','pre','mathematical_expression','blockquote','pullquote','expandable_blockquote']);
  const types=new Set([...media,...text,'divider','anchor','list','details','table','collage','slideshow','map','buttons','thinking']);
  const aliases={section_heading:'heading',block_quotation:'blockquote',pull_quotation:'pullquote',expandable_block_quotation:'expandable_blockquote'};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function visible(v,depth=0){
    if(depth>12||v==null)return '';
    if(typeof v==='string')return v.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/gi,' ').trim();
    if(Array.isArray(v))return v.map(x=>visible(x,depth+1)).join('');
    if(!object(v))return '';
    if(v.type==='custom_emoji'&&v.custom_emoji_id)return '◈';
    return ['text','value','children','content','nodes','rich_text','plain_text','emoji','expression']
      .map(k=>visible(v[k],depth+1)).join('');
  }
  const hasText=(...v)=>v.some(x=>Boolean(visible(x)));
  function checkPage(page){
    const blocks=page?.blocks;
    const issues=[];
    const add=(code,kind,blockId,index,path,topId)=>issues.push({
      code,kind,blockId:blockId||topId||null,topId:topId||blockId||null,index,path:path.slice(),
    });
    if(!Array.isArray(blocks)||!blocks.length){
      add('empty_page','page',null,-1,[],null);
      return issues;
    }
    function inspect(block,index,path,topId,depth=0,native=false){
      if(depth>24){add('nested_too_deep','block',block?.id,index,path,topId);return;}
      if(!object(block)){add('invalid_block','block',null,index,path,topId);return;}
      const id=String(block.id||'')||null;
      const rawType=String(block.type||'').trim();
      const data=native?block:(object(block.data)?block.data:{});
      if(!native&&data.native&&object(data.native_data)){
        const n=data.native_data;
        inspect({...n,id:id||n.id,type:n.type||data.native_type||rawType},index,path,topId,depth+1,true);
        return;
      }
      const kind=aliases[rawType]||rawType;
      const fail=code=>add(code,kind,id,index,path,topId);
      if(!types.has(kind)){fail('unsupported_block');return;}
      if(text.has(kind)){
        if(['blockquote','expandable_blockquote','pullquote'].includes(kind)){
          const nested=native?data.blocks:data.media_children;
          if(!hasText(data.quote_rich_text,data.quote_text,data.quote_html,data.rich_text,data.text,data.html)
            &&!(Array.isArray(nested)&&nested.length))fail('missing_text');
        }else if(kind==='mathematical_expression'){
          if(!hasText(data.expression,data.text,data.rich_text,data.html))fail('missing_expression');
        }else if(!hasText(data.rich_text,data.text,data.html))fail('missing_text');
      }else if(kind==='list'){
        if(!Array.isArray(data.items)||!data.items.length)fail('missing_items');
        else if(!data.items.some(it=>(Array.isArray(it?.blocks)&&it.blocks.length)||hasText(it?.text,it?.rich_text,it?.html,it)))
          fail('missing_items');
      }else if(['details','collage','slideshow'].includes(kind)){
        const children=native?data.blocks:data.children;
        if(!Array.isArray(children)||!children.length)fail('missing_children');
      }else if(kind==='table'){
        const rows=native?data.cells:(data.rows??data.native_data?.cells);
        if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||!r.length))fail('missing_cells');
        else if(!rows.some(r=>r.some(cell=>hasText(cell?.text,cell?.rich_text,cell?.html,cell))))fail('missing_cells');
      }else if(kind==='map'){
        const lat=native?(data.location?.latitude??data.latitude):data.latitude;
        const lon=native?(data.location?.longitude??data.longitude):data.longitude;
        if((!native&&(data._locating||data._draft===true))||lat==null||lon==null||lat===''||lon==='')fail('missing_coordinates');
        else if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)fail('invalid_coordinates');
      }else if(media.has(kind)){
        let file=native?data[kind==='voice'?'voice_note':kind]:data.file;
        if(Array.isArray(file))file=file.at(-1);
        if(data._uploading===true)fail('uploading_file');
        else if(!object(file)||!String(file.file_id||'').trim())fail('missing_file');
      }else if(kind==='anchor'){
        if(native&&!hasText(data.name))fail('missing_anchor');
      }else if(kind==='buttons'){
        if(!Array.isArray(data.buttons)||!data.buttons.length)fail('missing_buttons');
      }
      const children=native?data.blocks:(
        ['blockquote','expandable_blockquote','pullquote'].includes(kind)?data.media_children:data.children
      );
      if(Array.isArray(children))children.forEach((child,i)=>inspect(child,index,[...path,i+1],topId,depth+1,native));
      if(kind==='list'&&Array.isArray(data.items)){
        data.items.forEach((item,i)=>{
          if(Array.isArray(item?.blocks))item.blocks.forEach((child,j)=>inspect(child,index,[...path,i+1,j+1],topId,depth+1,native));
        });
      }
    }
    blocks.forEach((b,i)=>inspect(b,i,[i+1],b?.id||null));
    return issues;
  }
  root.RichPublishValidation=Object.freeze({checkPage});
})(globalThis);
