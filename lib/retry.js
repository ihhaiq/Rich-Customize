export function retryAfterDelay(retryAfter,attempt,{base=0.5,cap=30}={}){
  const exponent=Math.max(0,Number(attempt)||0),backoff=Math.min(Number(cap),Number(base)*(2**exponent));
  const jitter=Math.random()*Math.min(1,backoff*0.25);
  return Math.max(Number(retryAfter)||0,backoff+jitter);
}
