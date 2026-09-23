import { setSetting } from 'lib/config';

export default async function setup(input = {}) {
  const ids = Array.isArray(input.developer_ids)
    ? input.developer_ids.map(Number).filter(Number.isSafeInteger)
    : [];
  if (!ids.length) {
    throw new Error('developer_ids must contain at least one Telegram user id');
  }
  await setSetting('developer_ids', [...new Set(ids)]);
  return { developer_ids: [...new Set(ids)] };
}
