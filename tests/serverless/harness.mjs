import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Dependency-free isolated V8 harness. Only Telegram API and DB I/O are mocked;
// editor, rendering, localization, session TTL and undo/redo run real modules.
export async function harness({ intl = Intl, extraModules = {} } = {}) {
  const root = path.resolve(import.meta.dirname, '../../tgcloud');
  const context = vm.createContext({ console, Intl: intl, Date, Math, JSON, TextEncoder, setTimeout, clearTimeout, crypto: globalThis.crypto });
  const records = {};
  const calls = [];
  const tables = {};
  const schema = fs.readFileSync(path.join(root, 'schema.js'), 'utf8');
  for (const [, name] of schema.matchAll(/export const (\w+) =/g)) {
    records[name] = [];
    tables[name] = new Proxy({ _name: name }, { get: (target, prop) => prop === '_name' ? target._name : { table: name, key: prop } });
  }
  const keys = { goldenBroadcasts:'month', goldenAnnouncements:'key', goldenCampaigns:'month', goldenClaims:'key', legacyStates:'namespace', miniappBridgeRequests:'requestId', editorSessions: 'userId', maintenanceLocks: 'name', processedUpdates: 'updateId', requestWindows: 'key', richPages: 'pageId', usageUsers: 'userId', editorSubscriptions: 'userId', managedBotOrders: 'orderId', managedBotPayments: 'chargeId', managedBotLicenses: 'licenseId', brandingEntitlements: 'userId', brandingPreferences: 'userId', forumTopicDefaults: 'chatId' };
  const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
  class BotApiError extends Error {
    constructor(code, description) {
      super(description);
      this.code = code;
      this.description = description;
    }
  }
  const db = {
    async $count(table, predicate = () => true) {
      return records[table._name].filter(predicate).length;
    },
    select() {
      let name; let predicate = () => true; let sortColumn; let take = Infinity;
      const q = { from(table) { name = table._name; return q; }, where(p) { predicate = p; return q; },
        orderBy(column) { sortColumn=column;return q; }, limit(n) {take=n;return q;},
        async get() { return clone(records[name].find(predicate)); }, async all() { let rows=records[name].filter(predicate);if(sortColumn) rows.sort((a,b)=>a[sortColumn.key]-b[sortColumn.key]);return clone(rows.slice(0,take)); } };
      return q;
    },
    update(table) {
      let values; let predicate = () => true; let wantsReturn = false;
      const q = { set(v) { values = v; return q; }, where(p) { predicate = p; return q; },
        returning() { wantsReturn = true; return q; },
        async run() {
          const affected = records[table._name].filter(predicate);
          affected.forEach(row => Object.assign(row, clone(values)));
          return wantsReturn ? affected.map(clone) : undefined;
        } };
      return q;
    },
    delete(table) {
      let predicate = () => true;
      const q = { where(p) { predicate = p; return q; }, async run() { records[table._name] = records[table._name].filter(row => !predicate(row)); } };
      return q;
    },
    insert(table) {
      let values; let conflict;
      const q = { values(v) { values = v; return q; }, onConflictDoNothing() { return q; },
        onConflictDoUpdate(v) { conflict = v.set; return q; }, returning() { return q; },
        async run() {
          const list = records[table._name]; const key = keys[table._name];
          const existing = list.find(row => row[key] === values[key]);
          if (existing) { if (conflict) Object.assign(existing, clone(conflict)); return []; }
          list.push(clone(values)); return [clone(values)];
        } };
      return q;
    },
  };
  const api = new Proxy({}, { get: (_, method) => async args => {
    calls.push({ method, args: clone(args) });
    if (method === 'answerGuestQuery' && apiState.guestQueryErrors?.length) {
      throw apiState.guestQueryErrors.shift();
    }
    if (method === 'getUserProfilePhotos') {
      if (apiState.profilePhotoError) throw new Error(apiState.profilePhotoError);
      return clone(apiState.profilePhotos?.[String(args?.user_id)] || { total_count: 0, photos: [] });
    }
    if (method === 'getChat' && apiState.chats?.[String(args?.chat_id)]) {
      return clone(apiState.chats[String(args.chat_id)]);
    }
    if (method === 'getChatMember' && apiState.members?.[String(args?.user_id)]) {
      return clone(apiState.members[String(args.user_id)]);
    }
    if (method === 'sendMessage' && apiState.messageSendErrors?.[String(args.chat_id)]) throw apiState.messageSendErrors[String(args.chat_id)];
    if (method === 'getMe' && apiState.me) return clone(apiState.me);
    if (method === 'sendRichMessage' && apiState.richSendErrors?.[String(args.chat_id)]) {
      const errors = apiState.richSendErrors[String(args.chat_id)];
      if (Array.isArray(errors)) {
        if (errors.length) throw errors.shift();
      } else {
        throw errors;
      }
    }
    if (method === 'sendRichMessage' && apiState.richSendError) throw new Error(apiState.richSendError);
    if (method === 'getStickerSet') {
      if (apiState.error) throw new Error('Sticker set unavailable');
      return clone(apiState.pack);
    }
    if (method === 'getCustomEmojiStickers') return clone(apiState.customEmojiStickers || []);
    if (method === 'getFileContent') return apiState.fileContent || new Uint8Array();
    if (method === 'editMessageText' && apiState.editError) throw new Error(apiState.editError);
    return { message_id: 100, chat: { id: 1 } };
  } });
  const apiState = { pack: null, profilePhotos: {}, guestQueryErrors: [], customEmojiStickers: [], fileContent: new Uint8Array() };
  const eq = (column, value) => row => row[column.key] === value;
  const lt = (column, value) => row => row[column.key] < value;
  const sql = (parts, ...values) => {
    const column = values[0];
    const expected = values[1];
    if (column?.key === 'username' && typeof expected === 'string') {
      return row => String(row[column.key] || '').toLowerCase() === expected.toLowerCase();
    }
    return () => false;
  };
  const mocks = { sdk: { api, BotApiError, db, InputFile: class InputFile {} }, 'sdk/db': { eq, lt, lte: (column,value) => row => row[column.key]<=value, asc: column => column, desc: column => column, gt: (column, value) => row => row[column.key] > value, gte: (column, value) => row => row[column.key] >= value, sql, and: (...parts) => row => parts.every(p => p(row)) }, schema: tables };
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (mocks[name]) module = new vm.SyntheticModule(Object.keys(mocks[name]), function() {
      for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context, identifier: name });
    else module = new vm.SourceTextModule(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), { context, identifier: name });
    modules.set(name, module);
    return module;
  };
  const extraImports = Object.entries(extraModules).map(([key, name]) => `import * as ${key} from '${name}'; export { ${key} };`).join('\n');
  const entry = new vm.SourceTextModule(`${extraImports}\nimport * as flow from 'lib/editor-premium-emoji';
    import * as text from 'lib/rich-text'; import * as movement from 'lib/premium-emoji-text';
    import * as targets from 'lib/editor-emoji-targets'; import * as blocks from 'lib/editor-blocks';
    import * as renderer from 'lib/editor-renderer'; import * as session from 'lib/editor-session';
    import * as ui from 'lib/editor-block-ui';
    import * as i18n from 'lib/i18n'; import * as guard from 'lib/editor-guard';
    export { flow, text, movement, targets, blocks, renderer, session, ui, i18n, guard };`, { context });
  await entry.link((name, referencingModule) => {
    if (!name.startsWith('.')) return load(name);
    const relative = path.posix.normalize(path.posix.join(
      path.posix.dirname(referencingModule.identifier),
      name,
    )).replace(/\.js$/, '');
    return load(relative);
  });
  await entry.evaluate();
  return { ...entry.namespace, records, calls, apiState, BotApiError, clone };
}
