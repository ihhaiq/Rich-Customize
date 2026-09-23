const MAX_ZIP_ENTRIES = 20;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0; }
function utf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const a = bytes[i++];
    if (a < 0x80) { out += String.fromCharCode(a); continue; }
    if ((a & 0xe0) === 0xc0) {
      if (i >= bytes.length) throw new Error('Invalid UTF-8');
      const b = bytes[i++];
      if ((b & 0xc0) !== 0x80) throw new Error('Invalid UTF-8');
      const cp = ((a & 0x1f) << 6) | (b & 0x3f);
      if (cp < 0x80) throw new Error('Invalid UTF-8');
      out += String.fromCharCode(cp); continue;
    }
    if ((a & 0xf0) === 0xe0) {
      if (i + 1 >= bytes.length) throw new Error('Invalid UTF-8');
      const b = bytes[i++], c = bytes[i++];
      if ((b & 0xc0) !== 0x80 || (c & 0xc0) !== 0x80) throw new Error('Invalid UTF-8');
      const cp = ((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('Invalid UTF-8');
      out += String.fromCharCode(cp); continue;
    }
    if ((a & 0xf8) === 0xf0) {
      if (i + 2 >= bytes.length) throw new Error('Invalid UTF-8');
      const b = bytes[i++], c = bytes[i++], d = bytes[i++];
      if ((b & 0xc0) !== 0x80 || (c & 0xc0) !== 0x80 || (d & 0xc0) !== 0x80) throw new Error('Invalid UTF-8');
      let cp = ((a & 0x07) << 18) | ((b & 0x3f) << 12) | ((c & 0x3f) << 6) | (d & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) throw new Error('Invalid UTF-8');
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 | (cp >> 10), 0xdc00 | (cp & 0x3ff)); continue;
    }
    throw new Error('Invalid UTF-8');
  }
  return out;
}

class Bits {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; this.buf = 0; this.count = 0; }
  read(n) {
    while (this.count < n) {
      if (this.pos >= this.bytes.length) throw new Error('Unexpected end of deflate stream');
      this.buf |= this.bytes[this.pos++] << this.count;
      this.count += 8;
    }
    const mask = n === 32 ? 0xffffffff : (1 << n) - 1;
    const value = this.buf & mask;
    this.buf >>>= n;
    this.count -= n;
    return value >>> 0;
  }
  align() { this.buf = 0; this.count = 0; }
}

function reverseBits(code, length) {
  let out = 0;
  for (let i = 0; i < length; i++) { out = (out << 1) | (code & 1); code >>>= 1; }
  return out;
}
function huffman(lengths) {
  let max = 0;
  for (const n of lengths) if (n > max) max = n;
  if (!max) throw new Error('Empty Huffman tree');
  const count = new Array(max + 1).fill(0);
  for (const n of lengths) if (n) count[n]++;
  const next = new Array(max + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= max; bits++) {
    code = (code + (count[bits - 1] || 0)) << 1;
    next[bits] = code;
  }
  const tables = Array.from({length: max + 1}, () => new Map());
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const len = lengths[symbol];
    if (!len) continue;
    const c = reverseBits(next[len]++, len);
    tables[len].set(c, symbol);
  }
  return { max, tables };
}
function decode(bits, tree) {
  let code = 0;
  for (let len = 1; len <= tree.max; len++) {
    code |= bits.read(1) << (len - 1);
    const symbol = tree.tables[len].get(code);
    if (symbol !== undefined) return symbol;
  }
  throw new Error('Invalid Huffman code');
}

const LEN_BASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
function fixedTrees() {
  const lit = new Array(288).fill(0);
  for(let i=0;i<=143;i++) lit[i]=8;
  for(let i=144;i<=255;i++) lit[i]=9;
  for(let i=256;i<=279;i++) lit[i]=7;
  for(let i=280;i<=287;i++) lit[i]=8;
  return [huffman(lit), huffman(new Array(32).fill(5))];
}
const FIXED=fixedTrees();
function dynamicTrees(bits) {
  const hlit=bits.read(5)+257, hdist=bits.read(5)+1, hclen=bits.read(4)+4;
  const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  const clen=new Array(19).fill(0);
  for(let i=0;i<hclen;i++) clen[order[i]]=bits.read(3);
  const ct=huffman(clen);
  const lengths=[];
  while(lengths.length < hlit+hdist) {
    const sym=decode(bits,ct);
    if(sym<=15) lengths.push(sym);
    else if(sym===16) {
      if(!lengths.length) throw new Error('Invalid repeat code');
      const count=bits.read(2)+3, prev=lengths[lengths.length-1];
      for(let i=0;i<count;i++) lengths.push(prev);
    } else if(sym===17) {
      const count=bits.read(3)+3; for(let i=0;i<count;i++) lengths.push(0);
    } else if(sym===18) {
      const count=bits.read(7)+11; for(let i=0;i<count;i++) lengths.push(0);
    } else throw new Error('Invalid code-length symbol');
    if(lengths.length > hlit+hdist) throw new Error('Code-length overflow');
  }
  return [huffman(lengths.slice(0,hlit)), huffman(lengths.slice(hlit))];
}
function inflateRaw(input, expectedSize=0) {
  const bits=new Bits(input), out=[];
  let final=0;
  while(!final) {
    final=bits.read(1); const type=bits.read(2);
    if(type===0) {
      bits.align();
      if(bits.pos+4>input.length) throw new Error('Truncated stored block');
      const len=input[bits.pos] | (input[bits.pos+1]<<8);
      const nlen=input[bits.pos+2] | (input[bits.pos+3]<<8); bits.pos+=4;
      if(((len ^ 0xffff)&0xffff)!==nlen) throw new Error('Invalid stored block length');
      if(bits.pos+len>input.length) throw new Error('Truncated stored block data');
      for(let i=0;i<len;i++) out.push(input[bits.pos++]);
    } else if(type===1 || type===2) {
      const [litTree, distTree] = type===1 ? FIXED : dynamicTrees(bits);
      while(true) {
        const sym=decode(bits,litTree);
        if(sym<256) { out.push(sym); continue; }
        if(sym===256) break;
        if(sym<257 || sym>285) throw new Error('Invalid length symbol');
        const li=sym-257;
        const length=LEN_BASE[li] + (LEN_EXTRA[li] ? bits.read(LEN_EXTRA[li]) : 0);
        const ds=decode(bits,distTree);
        if(ds<0 || ds>=DIST_BASE.length) throw new Error('Invalid distance symbol');
        const distance=DIST_BASE[ds] + (DIST_EXTRA[ds] ? bits.read(DIST_EXTRA[ds]) : 0);
        if(distance<=0 || distance>out.length) throw new Error('Invalid deflate distance');
        for(let i=0;i<length;i++) out.push(out[out.length-distance]);
      }
    } else throw new Error('Reserved deflate block type');
    if(out.length > MAX_EXPANDED_BYTES) throw new Error('Expanded data exceeds 50MB');
  }
  if(expectedSize && out.length !== expectedSize) throw new Error(`Unexpected uncompressed size ${out.length} != ${expectedSize}`);
  return Uint8Array.from(out);
}

function findEocd(bytes) {
  const start=Math.max(0,bytes.length-65557);
  for(let i=bytes.length-22;i>=start;i--) if(u32(bytes,i)===0x06054b50) return i;
  return -1;
}
export function readZip(bytes) {
  if(!(bytes instanceof Uint8Array)) bytes=new Uint8Array(bytes);
  const eocd=findEocd(bytes); if(eocd<0) throw new Error('ZIP end record not found');
  const entries=u16(bytes,eocd+10), centralSize=u32(bytes,eocd+12), centralOffset=u32(bytes,eocd+16);
  if(entries>MAX_ZIP_ENTRIES) throw new Error('ZIP contains too many files');
  if(centralOffset+centralSize>bytes.length) throw new Error('Invalid ZIP central directory');
  let p=centralOffset, expanded=0; const result=new Map();
  for(let i=0;i<entries;i++) {
    if(u32(bytes,p)!==0x02014b50) throw new Error('Invalid ZIP central entry');
    const flags=u16(bytes,p+8), method=u16(bytes,p+10), compressedSize=u32(bytes,p+20), uncompressedSize=u32(bytes,p+24);
    const nameLen=u16(bytes,p+28), extraLen=u16(bytes,p+30), commentLen=u16(bytes,p+32), localOffset=u32(bytes,p+42);
    const name=utf8(bytes.subarray(p+46,p+46+nameLen));
    p += 46+nameLen+extraLen+commentLen;
    if(flags & 1) throw new Error('Encrypted ZIP files are not supported');
    if(name.endsWith('/')) continue;
    if(name.startsWith('/') || name.split('/').includes('..')) throw new Error('Unsafe ZIP path');
    if(u32(bytes,localOffset)!==0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLen=u16(bytes,localOffset+26), localExtraLen=u16(bytes,localOffset+28);
    const dataStart=localOffset+30+localNameLen+localExtraLen;
    const dataEnd=dataStart+compressedSize;
    if(dataEnd>bytes.length) throw new Error('Truncated ZIP entry');
    expanded += uncompressedSize;
    if(expanded>MAX_EXPANDED_BYTES) throw new Error('Expanded data exceeds 50MB');
    const compressed=bytes.subarray(dataStart,dataEnd);
    let content;
    if(method===0) content=Uint8Array.from(compressed);
    else if(method===8) content=inflateRaw(compressed,uncompressedSize);
    else throw new Error(`Unsupported ZIP compression method: ${method}`);
    result.set(name,content);
  }
  return result;
}
export function decodeUtf8(bytes){ return utf8(bytes); }
