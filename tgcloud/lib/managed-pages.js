import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { richPages } from 'schema';
import { buildInputRichMessage } from 'lib/editor-renderer';
// Render with the existing engine and no promotional branding. No managed tokens enter Serverless.
export async function managedPage(ownerId,pageId) {
 const row=await db.select().from(richPages).where(and(eq(richPages.ownerId,Number(ownerId)),eq(richPages.pageId,String(pageId)))).get();
 if(!row)throw Error('PAGE_NOT_FOUND');
 return {page_id:String(row.pageId),owner_id:Number(row.ownerId),updated_at:Number(row.updatedAt||0),
 rich_message:buildInputRichMessage(row.blocks,{userId:row.ownerId,sourcePageId:row.pageId,includeBranding:false}),
 buttons:row.buttons||[],buttons_per_row:row.buttonsPerRow||1};
}
