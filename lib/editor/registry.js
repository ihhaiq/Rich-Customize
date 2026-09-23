export const InputKind = Object.freeze({
  TEXT: 'text',
  TELEGRAM: 'telegram',
  NATIVE: 'native',
  AUTOMATIC: 'automatic',
  CONTAINER: 'container',
});

export function blockAdapter({
  blockType,
  inputKind,
  aliases = [],
  childTypes = [],
  supportsCaption = false,
}) {
  return Object.freeze({
    blockType,
    inputKind,
    aliases: Object.freeze([...aliases]),
    childTypes: Object.freeze([...childTypes]),
    supportsCaption: Boolean(supportsCaption),
    get isContainer() { return inputKind === InputKind.CONTAINER; },
    validate(block) {
      if (![blockType, ...aliases].includes(String(block?.type ?? ''))) return [`expected ${blockType}`];
      if (!block?.data || typeof block.data !== 'object' || Array.isArray(block.data)) return ['block data must be a mapping'];
      return [];
    },
  });
}

const detailsChildren = [
  'paragraph','heading','preformatted','footer','divider','mathematical_expression','anchor',
  'list','blockquote','pullquote','table','collage','slideshow','map','animation','audio',
  'document','photo','video','voice',
];

export const DEFAULT_ADAPTERS = Object.freeze([
  blockAdapter({ blockType:'paragraph', inputKind:InputKind.TEXT, aliases:['text'] }),
  blockAdapter({ blockType:'heading', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'preformatted', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'footer', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'divider', inputKind:InputKind.AUTOMATIC }),
  blockAdapter({ blockType:'mathematical_expression', inputKind:InputKind.NATIVE }),
  blockAdapter({ blockType:'anchor', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'list', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'blockquote', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'pullquote', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'collage', inputKind:InputKind.CONTAINER, childTypes:['photo','video'], supportsCaption:true }),
  blockAdapter({ blockType:'slideshow', inputKind:InputKind.CONTAINER, childTypes:['photo','video'], supportsCaption:true }),
  blockAdapter({ blockType:'table', inputKind:InputKind.TEXT }),
  blockAdapter({ blockType:'details', inputKind:InputKind.CONTAINER, childTypes:detailsChildren }),
  blockAdapter({ blockType:'map', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'animation', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'audio', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'document', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'photo', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'video', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
  blockAdapter({ blockType:'voice', inputKind:InputKind.TELEGRAM, supportsCaption:true }),
]);

export class BlockRegistry {
  constructor(adapters = []) {
    this.byType = new Map();
    this.canonical = new Map();
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (this.byType.has(adapter.blockType)) throw new Error(`Block adapter already registered: ${adapter.blockType}`);
    this.byType.set(adapter.blockType, adapter);
    this.canonical.set(adapter.blockType, adapter.blockType);
    for (const alias of adapter.aliases) {
      if (this.canonical.has(alias)) throw new Error(`Block alias already registered: ${alias}`);
      this.canonical.set(alias, adapter.blockType);
    }
  }

  canonicalType(blockType) {
    return this.canonical.get(blockType) ?? blockType;
  }

  get(blockType) {
    return this.byType.get(this.canonicalType(blockType)) ?? null;
  }

  require(blockType) {
    const adapter = this.get(blockType);
    if (!adapter) throw new Error(`Unsupported block type: ${blockType}`);
    return adapter;
  }

  supportedTypes() {
    return [...this.byType.keys()];
  }

  byInputKind(inputKind) {
    return [...this.byType.entries()]
      .filter(([, adapter]) => adapter.inputKind === inputKind)
      .map(([blockType]) => blockType);
  }

  compatibleChildren(containerType) {
    return [...(this.get(containerType)?.childTypes ?? [])];
  }
}

export const blockRegistry = new BlockRegistry(DEFAULT_ADAPTERS);
