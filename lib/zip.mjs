import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed DOS date/time (2026-11-15 00:00:00) for byte-for-byte reproducible builds
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 15;

/**
 * Create a deterministic ZIP archive from `{ path, data }` entries sorted by POSIX path.
 */
export function buildDeterministicZip(entries) {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, "en"));
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of sorted) {
    const nameBuf = Buffer.from(entry.path.replaceAll("\\", "/"), "utf8");
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = zlib.deflateRawSync(rawBuf, { level: 9 });
    const useDeflate = compressed.length < rawBuf.length;
    const payload = useDeflate ? compressed : rawBuf;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(FIXED_DOS_TIME, 10);
    localHeader.writeUInt16LE(FIXED_DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4); // version made by (Unix, 2.0)
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(FIXED_DOS_TIME, 12);
    centralHeader.writeUInt16LE(FIXED_DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file permissions
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralSize = centralChunks.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

/**
 * Parse and verify every entry inside a ZIP archive (CRC-32, sizes, duplicates),
 * returning decompressed buffers for source-sync integrity checks.
 */
export function readZipEntries(zipBuffer) {
  const buf = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer);
  if (buf.length < 22) {
    throw new Error("Invalid ZIP archive: shorter than EOCD header");
  }

  const minOffset = Math.max(0, buf.length - (22 + 65535));
  let eocdOffset = -1;
  for (let pos = buf.length - 22; pos >= minOffset; pos -= 1) {
    if (buf.readUInt32LE(pos) === 0x06054b50) {
      const commentLen = buf.readUInt16LE(pos + 20);
      if (pos + 22 + commentLen === buf.length) {
        eocdOffset = pos;
        break;
      }
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: missing EOCD signature");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralSize = buf.readUInt32LE(eocdOffset + 12);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  if (centralOffset + centralSize > eocdOffset) {
    throw new Error("Invalid ZIP archive: corrupt central directory bounds");
  }

  const entries = [];
  const seenPaths = new Set();
  let ptr = centralOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (ptr + 46 > centralOffset + centralSize || buf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error(`Invalid ZIP archive: bad central directory header at index ${i}`);
    }
    const method = buf.readUInt16LE(ptr + 10);
    const expectedCrc = buf.readUInt32LE(ptr + 16);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);

    const entryPath = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    if (seenPaths.has(entryPath)) {
      throw new Error(`Invalid ZIP archive: duplicate entry '${entryPath}'`);
    }
    seenPaths.add(entryPath);

    if (localOffset + 30 > centralOffset || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP archive: missing local header for '${entryPath}'`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) {
      throw new Error(`Invalid ZIP archive: truncated entry payload for '${entryPath}'`);
    }

    const payload = buf.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) {
      data = Buffer.from(payload);
    } else if (method === 8) {
      data = zlib.inflateRawSync(payload);
    } else {
      throw new Error(`Invalid ZIP archive: unsupported compression method ${method} for '${entryPath}'`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Invalid ZIP archive: size mismatch for '${entryPath}'`);
    }
    if (crc32(data) !== expectedCrc) {
      throw new Error(`Invalid ZIP archive: CRC-32 mismatch for '${entryPath}'`);
    }

    entries.push({ path: entryPath, data });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  if (ptr !== centralOffset + centralSize) {
    throw new Error("Invalid ZIP archive: trailing unparsed central directory bytes");
  }

  return entries;
}
