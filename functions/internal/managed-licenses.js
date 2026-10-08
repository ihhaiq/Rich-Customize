import { acceptLicenseEvent } from '../_lib/managed-bot-licenses.js';
import { responseJson } from '../_lib/managed-bots.js';
import { ManagedError } from '../_lib/managed-bot-service.js';
export async function onRequestPost({request,env}) {
 try{return responseJson(await acceptLicenseEvent(request,env));}
 catch(e){return responseJson({error:e instanceof ManagedError?e.code:'unavailable'},e instanceof ManagedError?e.status:503);}
}
