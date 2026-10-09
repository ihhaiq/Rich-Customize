import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Dependency-free isolated V8 harness. Only Telegram API and DB I/O are mocked;
// editor, rendering, localization, session TTL and undo/redo run real modules.
export async function harness({ intl = Intl, extraModules = {} } = {}) {
  const root = path.resolve(import.meta.dirname, '../../tgcloud');
  const context = vm.createContext({ console, Intl: intl, Date, Math, JSON, setTimeout, clearTimeout, crypto: globalThis.crypto });
  const records = {};
  const calls = [];
  const tables = {};
  const schema = fs.readFileSync(path.join(root, 'schema.js'), 'utf8');
  for (const [, name] of schema.matchAll(/export const (\w+) =/g)) {
    records[name] = [];
    tables[name] = new Proxy({ _name: name }, { get: (target, prop) => prop === '_name' ? target._name : { table: name, key: prop } });
  }
  const keys = { editorSessions: 'userId', maintenanceLocks: 'name', richPages: 'pageId', usageUsers: 'userId', editorSubscriptions: 'userId' };
  const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
  const db = {
    select() {
      let name; let predicate = () => true;
      const q = { from(table) { name = table._name; return q; }, where(p) { predicate = p; return q; },
        async get() { return clone(records[name].find(predicate)); }, async all() { return clone(records[name].filter(predicate)); } };
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
    if (method === 'getStickerSet') {
      if (apiState.error) throw new Error('Sticker set unavailable');
      return clone(apiState.pack);
    }
    if (method === 'editMessageText' && apiState.editError) throw new Error(apiState.editError);
    return { message_id: 100, chat: { id: 1 } };
  } });
  const apiState = { pack: null };
  const eq = (column, value) => row => row[column.key] === value;
  const lt = (column, value) => row => row[column.key] < value;
  const mocks = { sdk: { api, db, InputFile: class InputFile {} }, 'sdk/db': { eq, lt, asc: column => column, desc: column => column, gte: (column, value) => row => row[column.key] >= value, sql: () => null, and: (...parts) => row => parts.every(p => p(row)) }, schema: tables };
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
  await entry.link((name) => load(name));
  await entry.evaluate();
  return { ...entry.namespace, records, calls, apiState, clone };
}
