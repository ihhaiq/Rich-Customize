import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../../app/miniapp_static/' + file, import.meta.url), 'utf8');

function buildAddContainerMedia(uploadOneMedia) {
  const source = read('media_upload.js');
  const start = source.indexOf('async function addContainerMedia(block, files) {');
  const end = source.indexOf('\nfunction containerMediaEditor(block)', start);
  assert.ok(start >= 0 && end > start, 'container media append handler is present');

  const events = {dirty:0, history:0, renders:0, toasts:[]};
  let nextId = 0;
  const addContainerMedia = new Function(
    'defaultBlock',
    'uploadOneMedia',
    'mediaFileData',
    'info',
    'mt',
    'markDirty',
    'renderBlocks',
    'pushHistory',
    'toast',
    `${source.slice(start, end)};return addContainerMedia;`,
  )(
    type => ({id:`media-${++nextId}`,type,data:{}}),
    uploadOneMedia,
    data => ({file_id:data.file_id}),
    type => ({label:type}),
    (key, values={}) => `${key}:${values.error || values.count || ''}`,
    () => events.dirty++,
    () => events.renders++,
    () => events.history++,
    text => events.toasts.push(text),
  );
  return {addContainerMedia, events};
}

test('Details blocks accept repeated child additions without replacing earlier children', () => {
  const source = read('details_nested_editor.js');
  const window = {};
  let nextId = 0;
  const context = {
    window,
    defaultBlock: type => ({id:`child-${++nextId}`,type,position:0,data:{}}),
    markDirty() {},
    pushHistory() {},
    renderBlocks() {},
    requestAnimationFrame() {},
    blocksEl:{querySelector(){return null;}},
  };
  vm.runInNewContext(source, context);

  const details = {
    id:'details-1',
    data:{children:[{id:'existing',type:'paragraph',position:0,data:{text:'keep'}}]},
  };
  window.RichDetailsNestedEditor.addNestedBlock(details, 'heading');
  window.RichDetailsNestedEditor.addNestedBlock(details, 'photo');

  assert.deepEqual(
    JSON.parse(JSON.stringify(details.data.children.map(({id,type,position}) => ({id,type,position})))),
    [
      {id:'existing',type:'paragraph',position:0},
      {id:'child-1',type:'heading',position:1},
      {id:'child-2',type:'photo',position:2},
    ],
  );

  window.RichDetailsNestedEditor.replaceNestedBlock(details, 'child-1', 'video');
  assert.deepEqual(
    JSON.parse(JSON.stringify(details.data.children.map(({id,type,position}) => ({id,type,position})))),
    [
      {id:'existing',type:'paragraph',position:0},
      {id:'child-3',type:'video',position:1},
      {id:'child-2',type:'photo',position:2},
    ],
  );
  window.RichDetailsNestedEditor.moveNestedBlock(details, 'child-2', -1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(details.data.children.map(({id,position}) => ({id,position})))),
    [
      {id:'existing',position:0},
      {id:'child-2',position:1},
      {id:'child-3',position:2},
    ],
  );
});

test('collage and slideshow media uploads append to existing media across selections', async () => {
  for (const type of ['collage', 'slideshow']) {
    const {addContainerMedia, events} = buildAddContainerMedia(async file => ({file_id:file.name}));
    const block = {type,data:{children:[{
      id:'existing',type:'photo',position:0,data:{file:{file_id:'saved-photo'}},
    }]}};

    await addContainerMedia(block, [{name:'new-photo.jpg',type:'image/jpeg'}]);
    await addContainerMedia(block, [{name:'new-video.mp4',type:'video/mp4'}]);

    assert.deepEqual(
      JSON.parse(JSON.stringify(block.data.children.map(child => ({
        id:child.id,
        type:child.type,
        position:child.position,
        file_id:child.data.file.file_id,
      })))),
      [
        {id:'existing',type:'photo',position:0,file_id:'saved-photo'},
        {id:'media-1',type:'photo',position:1,file_id:'new-photo.jpg'},
        {id:'media-2',type:'video',position:2,file_id:'new-video.mp4'},
      ],
      type,
    );
    assert.equal(block.data._draft, false, type);
    assert.equal(events.dirty, 2, type);
    assert.equal(events.history, 2, type);
  }
});

test('successful media in a failed upload batch remains dirty and undoable', async () => {
  const {addContainerMedia, events} = buildAddContainerMedia(async file => {
    if (file.name === 'failed.jpg') throw new Error('upload rejected');
    return {file_id:file.name};
  });
  const block = {type:'collage',data:{children:[{
    id:'existing',type:'photo',position:0,data:{file:{file_id:'saved-photo'}},
  }]}};

  await addContainerMedia(block, [
    {name:'uploaded.jpg',type:'image/jpeg'},
    {name:'failed.jpg',type:'image/jpeg'},
    {name:'not-attempted.jpg',type:'image/jpeg'},
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(block.data.children.map(child => child.data.file.file_id))),
    ['saved-photo','uploaded.jpg'],
  );
  assert.equal(block.data._uploading, false);
  assert.equal(block.data._draft, false);
  assert.equal(events.dirty, 1);
  assert.equal(events.history, 1);
  assert.match(events.toasts[0], /upload rejected/);
});
