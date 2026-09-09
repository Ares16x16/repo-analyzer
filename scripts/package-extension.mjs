#!/usr/bin/env node
/**
 * Zip browser-extension/ into dist/repo-analyzer-<version>.zip for distribution.
 * Pure Node — no system `zip` binary required.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'browser-extension');
const outDir = join(root, 'dist');

const manifest = JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf8'));
const version = manifest.version || '0.0.0';
const outFile = join(outDir, `repo-analyzer-${version}.zip`);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = relative(srcDir, file).split('\\').join('/');
    const data = readFileSync(file);
    const compressed = deflateRawSync(data);
    const useStore = compressed.length >= data.length;
    const payload = useStore ? data : compressed;
    const method = useStore ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(payload.length), u32(data.length),
      u16(nameBuf.length), u16(0), nameBuf, payload
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(payload.length), u32(data.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      nameBuf
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralDir.length), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, centralDir, end]);
}

if (!existsSync(srcDir)) {
  console.error('Missing browser-extension/');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const files = (await listFiles(srcDir)).sort();
const zipBuf = buildZip(files);
await writeFile(outFile, zipBuf);
console.log(`Wrote ${outFile} (${zipBuf.length} bytes, ${files.length} files)`);
