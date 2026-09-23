function redact(value){return String(value??'').replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g,'<redacted-token>').replace(/\b(user_id|chat_id|message_id|bot_id|owner_id)=(-?\d+)\b/g,'$1=<redacted>');}
export function log(level,message,extra={}){const payload={timestamp:new Date().toISOString(),level,message:redact(message),...extra};const fn=console[level]??console.log;fn(JSON.stringify(payload));}
export function info(message,extra){log('info',message,extra);} export function warn(message,extra){log('warn',message,extra);} export function error(message,extra){log('error',message,extra);}
