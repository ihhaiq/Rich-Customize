// Telegram Serverless does not use the old Railway process environment.
// Keep developer access explicit in deployed code. Add numeric Telegram user IDs
// here before enabling the private /dev actions.
export const DEVELOPER_IDS = Object.freeze([
  // 123456789,
]);

export function developerAccessConfigured() {
  return DEVELOPER_IDS.length > 0;
}

export function isDeveloper(userId) {
  const id = Number(userId);
  return Number.isSafeInteger(id) && DEVELOPER_IDS.includes(id);
}
