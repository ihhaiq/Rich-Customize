import { api, BotApiError } from 'sdk';
import { getSetting } from 'lib/config';
import { readState, writeState } from 'lib/storage/state';
import { MissingShowcaseMedia } from 'lib/errors';

const SUPPORTED=['photo','video','animation','audio','voice'];
const DEFAULT_CHANNEL=-1004433851299;

function now(){return Math.floor(Date.now()/1000);}
function fileOf(message){
  if(Array.isArray(message?.photo)&&message.photo.length)return ['photo',message.photo.at(-1).file_id];
  for(const kind of ['video','animation','audio','voice'])if(message?.[kind]?.file_id)return [kind,message[kind].file_id];
  return [null,null];
}
export async function showcaseChannelId(){
  const value=await getSetting('showcase_media_channel_id',DEFAULT_CHANNEL);
  return Number(value)||DEFAULT_CHANNEL;
}
export async function rememberShowcaseMessage(message){
  if(Number(message?.chat?.id)!==await showcaseChannelId())return false;
  const state=await readState('showcase_channel',{channel_id:Number(message.chat.id),messages:[]});
  const snapshot={message_id:Number(message.message_id),date:Number(message.date??now()),media_group_id:message.media_group_id??null,text:message.text??null,caption:message.caption??null,rich_message:message.rich_message??null};
  state.messages=(state.messages??[]).filter(x=>Number(x.message_id)!==snapshot.message_id);
  state.messages.push(snapshot);state.messages.sort((a,b)=>a.message_id-b.message_id);state.updated_at=now();
  await writeState('showcase_channel',state);
  const [kind,fileId]=fileOf(message);
  if(kind&&fileId){
    const media=await readState('showcase_media',Object.fromEntries(SUPPORTED.map(k=>[k,[]])));
    media[kind]??=[];
    if(!media[kind].includes(fileId))media[kind]=[...media[kind],fileId].slice(-200);
    await writeState('showcase_media',media);
  }
  return true;
}
export async function showcaseMedia(){
  const media=await readState('showcase_media',Object.fromEntries(SUPPORTED.map(k=>[k,[]])));
  const missing=SUPPORTED.filter(k=>!Array.isArray(media[k])||!media[k].length);
  if(missing.length)throw new MissingShowcaseMedia(missing);
  const pick=k=>media[k][Math.floor(Math.random()*media[k].length)];
  return {photo1:pick('photo'),photo2:pick('photo'),video:pick('video'),animation:pick('animation'),audio:pick('audio'),voice:pick('voice')};
}
export async function sendAllBlocksShowcase(chatId,userId,language='en'){
  const media=await showcaseMedia(),arabic=language==='ar';
  const future=now()+3600;
  const html=(arabic?
    '<h1>قالب جميع Rich Blocks</h1><p><b>عريض</b>، <i>مائل</i>، <u>تحته خط</u>، <s>مشطوب</s>، <code>inline code</code>، <tg-spoiler>مخفي</tg-spoiler>، <a href="https://telegram.org">رابط</a>، <a href="tg://user?id='+userId+'">إشارة للمستخدم</a>، <tg-time unix="'+future+'" format="wDT">بعد ساعة</tg-time>، <tg-math>x^2+y^2</tg-math>.</p>':
    '<h1>Every Rich Block Showcase</h1><p><b>Bold</b>, <i>italic</i>, <u>underline</u>, <s>strikethrough</s>, <code>inline code</code>, <tg-spoiler>spoiler</tg-spoiler>, <a href="https://telegram.org">URL</a>, <a href="tg://user?id='+userId+'">user mention</a>, <tg-time unix="'+future+'" format="wDT">in one hour</tg-time>, <tg-math>x^2+y^2</tg-math>.</p>')+
    '<h1>H1</h1><h2>H2</h2><h3>H3</h3><pre><code class="language-python">print("Rich")</code></pre><hr/><a name="demo-anchor"></a>'+
    '<ul><li>Item</li><li><input type="checkbox" checked>Checked</li></ul><blockquote><p>Quotation</p><cite>Author</cite></blockquote><aside>Pull quote<cite>Author</cite></aside><tg-math-block>E = mc^2</tg-math-block>'+
    '<table bordered striped><caption>Table</caption><tr><th colspan="2">Header</th></tr><tr><td>Cell</td><td>One</td></tr></table>'+
    '<details open><summary>Details</summary><p>Inside Details</p></details>'+
    '<figure><img src="tg://photo?id=show_photo_1"/><figcaption>Photo</figcaption></figure>'+
    '<figure><video src="tg://video?id=show_video"></video><figcaption>Video</figcaption></figure>'+
    '<figure><audio src="tg://audio?id=show_audio"></audio><figcaption>Audio</figcaption></figure>'+
    '<figure><audio src="tg://audio?id=show_voice"></audio><figcaption>Voice</figcaption></figure>'+
    '<figure><video src="tg://video?id=show_animation"></video><figcaption>GIF</figcaption></figure>'+
    '<figure><tg-map lat="33.3152" long="44.3661" zoom="12"/><figcaption>Map</figcaption></figure>'+
    '<tg-collage><img src="tg://photo?id=show_photo_1"/><img src="tg://photo?id=show_photo_2"/></tg-collage>'+
    '<tg-slideshow><img src="tg://photo?id=show_photo_2"/><video src="tg://video?id=show_video"></video></tg-slideshow><footer>Rich Message Editor</footer>';
  const rich_message={html,is_rtl:arabic,media:[
    {id:'show_photo_1',media:{type:'photo',media:media.photo1}},
    {id:'show_photo_2',media:{type:'photo',media:media.photo2}},
    {id:'show_video',media:{type:'video',media:media.video}},
    {id:'show_animation',media:{type:'animation',media:media.animation}},
    {id:'show_audio',media:{type:'audio',media:media.audio}},
    {id:'show_voice',media:{type:'voice_note',media:media.voice}},
  ]};
  try{return await api.sendRichMessage({chat_id:chatId,rich_message});}
  catch(error){
    if(error instanceof BotApiError&&String(error.description??'').toUpperCase().includes('VOICE_MESSAGES_FORBIDDEN')){
      rich_message.media=rich_message.media.filter(x=>x.id!=='show_voice');
      rich_message.html=rich_message.html.replace(/<figure><audio src="tg:\/\/audio\?id=show_voice"[\s\S]*?<\/figure>/,'');
      return api.sendRichMessage({chat_id:chatId,rich_message});
    }
    throw error;
  }
}
export async function refreshShowcase(validationChatId){
  const channelId=await showcaseChannelId(),state=await readState('showcase_channel',{channel_id:channelId,messages:[]});
  const retained=[],temporary=[];let failed=0;
  for(const item of state.messages??[]){
    try{const copied=await api.copyMessage({chat_id:validationChatId,from_chat_id:channelId,message_id:item.message_id,disable_notification:true});temporary.push(copied.message_id);retained.push(item);}
    catch(error){if(!(error instanceof BotApiError&&/MESSAGE_ID_INVALID|MESSAGE_NOT_FOUND|MESSAGE TO COPY NOT FOUND/i.test(String(error.description??''))))failed++;}
  }
  if(temporary.length){try{await api.deleteMessages({chat_id:validationChatId,message_ids:temporary});}catch{}}
  const total=(state.messages??[]).length;state.messages=retained;state.updated_at=now();await writeState('showcase_channel',state);
  return {total,retained:retained.length,removed:total-retained.length,failed_checks:failed};
}
