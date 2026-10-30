import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../../app/miniapp_static/' + file, import.meta.url), 'utf8');

function buildUploadOneMedia({status=200,responseText='{"file_id":"uploaded"}',isHosted=false}={}) {
  const source = read('media_upload.js');
  const start = source.indexOf('async function uploadOneMedia(file, kind, previewKey, onProgress) {');
  const end = source.indexOf('\nasync function uploadMediaToTelegram', start);
  assert.ok(start >= 0 && end > start, 'single-media uploader is present');

  const events = {progress:[],headers:{},sent:null};
  class FakeFormData {
    append(...args) { this.value=args; }
  }
  class FakeXMLHttpRequest {
    constructor() {
      this.upload={addEventListener:(name,handler)=>{this.progressHandler=handler;}};
      this.listeners={};
      this.status=status;
      this.responseText=responseText;
    }
    open(method,url) { events.request={method,url}; }
    setRequestHeader(name,value) { events.headers[name]=value; }
    addEventListener(name,handler) { this.listeners[name]=handler; }
    send(form) {
      events.sent=form;
      this.progressHandler?.({lengthComputable:true,loaded:25,total:100});
      this.listeners.load();
    }
  }

  const uploadOneMedia = new Function(
    'mediaConfig','mt','rememberPreview','FormData','XMLHttpRequest','tg','uploadErrorText','window',
    `${source.slice(start,end)};return uploadOneMedia;`,
  )(
    kind=>({max:1024,label:kind}),
    key=>key,
    ()=>{},
    FakeFormData,
    FakeXMLHttpRequest,
    {initData:'test-init-data'},
    (code,httpStatus)=>`${code}:${httpStatus}`,
    {RichMiniAppServerless:{isHosted,cloudflareApiOrigin:'https://rich-customize.pages.dev'}},
  );
  return {uploadOneMedia,events};
}

test('media uploader exposes measured request progress and preserves its upload contract', async () => {
  const {uploadOneMedia,events}=buildUploadOneMedia();
  const progress=[];
  const result=await uploadOneMedia({size:100,name:'photo.jpg'},'photo','block-1',value=>progress.push(value));

  assert.deepEqual(result,{file_id:'uploaded'});
  assert.deepEqual(progress,[25]);
  assert.deepEqual(events.request,{method:'POST',url:'/miniapp/api/upload/photo'});
  assert.equal(events.headers['X-Telegram-Init-Data'],'test-init-data');
  assert.ok(events.sent instanceof Object);
});

test('media uploader reports HTTP failures using the existing endpoint error text', async () => {
  const {uploadOneMedia}=buildUploadOneMedia({status:413,responseText:'too_large'});
  await assert.rejects(
    uploadOneMedia({size:100,name:'photo.jpg'},'photo'),
    /too_large:413/,
  );
});

test('media uploader routes requests from the Telegram Serverless host to Cloudflare', async () => {
  const {uploadOneMedia,events}=buildUploadOneMedia({isHosted:true});
  await uploadOneMedia({size:100,name:'photo.jpg'},'photo');

  assert.equal(events.request.url,'https://rich-customize.pages.dev/miniapp/api/upload/photo');
  assert.equal(events.headers['X-Telegram-Init-Data'],'test-init-data');
});

test('editor motion is wired to block, preview, save and selection actions with reduced-motion support', () => {
  const app=read('app.js');
  const features=read('editor_features.js');
  const styles=read('interactions.css');
  const html=read('editor.html');

  assert.match(app,/animateBlockEntry\(block\.id\)/);
  assert.match(app,/animateBlockExit\(id\)/);
  assert.match(app,/animateBlockLayout\(previous\)/);
  assert.match(app,/\{saved:true\}/);
  assert.match(features,/preview-entering/);
  assert.match(features,/selection-pop/);
  assert.match(features,/RichBlockMotion\?\.reorder/);
  for(const name of ['blockEnter','blockExit','saveConfirmed','selectionPop','previewEnter','previewLeave']) {
    assert.match(styles,new RegExp(`@keyframes ${name}\\b`));
  }
  assert.match(styles,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html,/interactions\.css\?v=0\.3\.21/);
});

test('media upload UI contains an accessible progress bar and updates it from XHR progress', () => {
  const source=read('media_upload.js');
  const styles=read('media_upload.css');
  assert.match(source,/role", "progressbar"/);
  assert.match(source,/request\.upload\.addEventListener\("progress"/);
  assert.match(source,/updateMediaUploadProgress\(block,progress\)/);
  assert.match(styles,/\.media-upload-progress-fill/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
});
