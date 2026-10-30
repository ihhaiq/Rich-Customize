import { EndpointError } from 'sdk';
import { handleMiniAppServerlessEndpoint } from '../lib/miniapp-bridge.js';

export default async function (input, context) {
  try {
    return await handleMiniAppServerlessEndpoint(input, context);
  } catch (error) {
    const expected = error?.name === 'BridgeError';
    const code = String(error?.code || (expected ? 'MINIAPP_REQUEST_FAILED' : 'INTERNAL'));
    if (!expected) console.error('Mini App Serverless endpoint failed', error);
    throw new EndpointError(
      expected ? String(error.message || 'Mini App request failed.') : 'Mini App request failed.',
      { code },
    );
  }
}
