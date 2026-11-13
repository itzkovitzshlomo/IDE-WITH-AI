import { WorkspaceFile } from '../types/ide';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Generates a valid PKZIP (.zip) archive completely offline in memory
 * preserving full folder paths for all project files.
 */
export function buildProjectZipBlob(
  projectName: string,
  folders: string[],
  files: WorkspaceFile[]
): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let entryCount = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const addEntry = (entryName: string, data: Uint8Array) => {
    const nameBytes = encoder.encode(entryName);
    const crc = crc32(data);

    // Local File Header (30 bytes + name)
    const lfh = new ArrayBuffer(30);
    const lv = new DataView(lfh);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Store (no compression)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);

    const localChunk = concatUint8Arrays([new Uint8Array(lfh), nameBytes, data]);
    localParts.push(localChunk);

    // Central Directory Header (46 bytes + name)
    const cdh = new ArrayBuffer(46);
    const cv = new DataView(cdh);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, entryName.endsWith('/') ? 0x10 : 0, true);
    cv.setUint32(42, offset, true);

    centralParts.push(concatUint8Arrays([new Uint8Array(cdh), nameBytes]));
    offset += localChunk.length;
    entryCount++;
  };

  // Emit explicit folder entries
  const normalizedFolders = Array.from(
    new Set(
      folders
        .map((f) => f.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
    )
  ).sort();

  for (const folder of normalizedFolders) {
    addEntry(`${folder}/`, new Uint8Array(0));
  }

  // Emit all project files
  for (const file of files) {
    const relPath = file.path.replace(/^\/+/, '');
    addEntry(relPath, encoder.encode(file.content));
  }

  // Emit a project manifest file inside the zip
  const manifestJson = JSON.stringify(
    {
      name: projectName,
      exportedAt: new Date().toISOString(),
      generator: 'MEO Studio Offline IDE',
      fileCount: files.length,
    },
    null,
    2
  );
  addEntry('meo-project.json', encoder.encode(manifestJson));

  const centralDir = concatUint8Arrays(centralParts);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entryCount, true);
  ev.setUint16(10, entryCount, true);
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const archiveBytes = concatUint8Arrays([...localParts, centralDir, new Uint8Array(eocd)]);
  const buffer = archiveBytes.buffer.slice(
    archiveBytes.byteOffset,
    archiveBytes.byteOffset + archiveBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/zip' });
}
