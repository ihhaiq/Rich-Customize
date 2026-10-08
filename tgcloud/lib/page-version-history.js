import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { richPages, editorPageVersions } from 'schema';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { planBenefit } from 'lib/subscription-policy';
import { validateEditorLimits } from 'lib/editor-blocks';
import { enqueuePageUpsertSync, flushMiniAppSyncOutbox, nextPageSyncVersion } from 'lib/miniapp-sync';

// A snapshot is the full editable page, not just the rendered Telegram output.
function snapshot(page) {
  return {
    title:String(page.title || ''),
    blocks:JSON.parse(JSON.stringify(page.blocks || [])),
    buttons:JSON.parse(JSON.stringify(page.buttons || [])),
    buttonsPerRow:Number(page.buttonsPerRow || 1),
    buttonsAlign:String(page.buttonsAlign || 'center'),
  };
}
function sameContent(a,b) { return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b)); }
function versionId(ownerId,pageId,revision) {
  return String(ownerId) + ':' + String(pageId) + ':' + Number(revision);
}
async function versionsFor(ownerId,pageId) {
  const rows=await db.select().from(editorPageVersions)
    .where(and(eq(editorPageVersions.ownerId,Number(ownerId)),
      eq(editorPageVersions.pageId,String(pageId)))).all();
  return rows.sort((a,b)=>Number(b.revision)-Number(a.revision));
}

export async function archivePreviousPageVersion(ownerId,previous,current) {
  const userId=Number(ownerId);
  if (!previous || !current || Number(previous.ownerId)!==userId
      || Number(current.ownerId)!==userId
      || String(previous.pageId)!==String(current.pageId)
      || sameContent(previous,current)) return false;
  const entitlement=await getEditorEntitlement(userId);
  const max=planBenefit(entitlement,'history');
  if (max<=0) return false;
  const id=versionId(userId,previous.pageId,previous.revision || 1);
  await db.insert(editorPageVersions).values({
    versionId:id,ownerId:userId,pageId:String(previous.pageId),
    revision:Number(previous.revision || 1),payload:snapshot(previous),
    createdAt:Math.floor(Date.now()/1000),
  }).onConflictDoNothing({target:editorPageVersions.versionId}).run();
  const rows=await versionsFor(userId,previous.pageId);
  for (const row of rows.slice(max)) {
    await db.delete(editorPageVersions)
      .where(eq(editorPageVersions.versionId,String(row.versionId))).run();
  }
  return true;
}

export async function listSavedPageVersions(ownerId,pageId) {
  const userId=Number(ownerId);
  const page=await db.select().from(richPages).where(and(
    eq(richPages.pageId,String(pageId)),eq(richPages.ownerId,userId))).get();
  if (!page) return {status:'missing',versions:[]};
  const entitlement=await getEditorEntitlement(userId);
  const limit=planBenefit(entitlement,'history');
  if (!limit) return {status:'upgrade_required',versions:[]};
  const rows=await versionsFor(userId,pageId);
  return {status:'ok',title:String(page.title || ''),currentRevision:Number(page.revision||1),
    versions:rows.slice(0,limit).map(x=>({revision:Number(x.revision),
      title:String(x.payload?.title || ''),createdAt:Number(x.createdAt||0)}))};
}

// Restore is a normal new revision; the current state is first archived.
// Historical snapshots remain server-side, with owner and revision checks.
export async function restoreSavedPageVersion(ownerId,pageId,historyRevision,expectedCurrentRevision) {
  const userId=Number(ownerId),id=String(pageId),revision=Number(historyRevision);
  const current=await db.select().from(richPages).where(and(
    eq(richPages.pageId,id),eq(richPages.ownerId,userId))).get();
  if (!current) return {status:'missing'};
  if (Number(current.revision||1)!==Number(expectedCurrentRevision)) return {status:'conflict'};
  const entitlement=await getEditorEntitlement(userId);
  if (!planBenefit(entitlement,'history')) return {status:'upgrade_required'};
  const historical=await db.select().from(editorPageVersions).where(and(
    eq(editorPageVersions.ownerId,userId),
    eq(editorPageVersions.pageId,id),
    eq(editorPageVersions.revision,revision))).get();
  if (!historical?.payload) return {status:'missing_version'};
  const data=historical.payload;
  const validity=validateEditorLimits(data.blocks,userId,{
    previousBlocks:current.blocks || [],entitlement,
  });
  if (!validity.ok) return {status:'limit',limit:validity};
  const version=await nextPageSyncVersion(current.revision || 1);
  const savedAt=Math.max(Math.floor(Date.now()/1000),Number(current.updatedAt||0)+1);
  const changes=await db.update(richPages).set({
    title:String(data.title||current.title).slice(0,64),
    blocks:JSON.parse(JSON.stringify(data.blocks||[])),
    buttons:JSON.parse(JSON.stringify(data.buttons||[])),
    buttonsPerRow:Number(data.buttonsPerRow||1),
    buttonsAlign:String(data.buttonsAlign||'center'),
    revision:version.revision,syncSeq:version.syncSeq,updatedAt:savedAt,
  }).where(and(eq(richPages.pageId,id),eq(richPages.ownerId,userId),
    eq(richPages.revision,Number(current.revision||1))))
    .returning({pageId:richPages.pageId}).run();
  if (!Array.isArray(changes) || !changes.length) return {status:'conflict'};
  const saved=await db.select().from(richPages).where(and(
    eq(richPages.pageId,id),eq(richPages.ownerId,userId))).get();
  if (saved) {
    // The page is already committed. Auxiliary history/outbox errors must not
    // misreport the successful restore or spur a duplicate mutation.
    try { await archivePreviousPageVersion(userId,current,saved); }
    catch(error){console.warn('Could not archive pre-restore page',error);}
    try {
      await enqueuePageUpsertSync(saved);
      await flushMiniAppSyncOutbox({limit:1});
    } catch(error) { console.warn('Restored page sync is pending retry',error); }
  }
  return {status:'restored',revision:version.revision};
}
