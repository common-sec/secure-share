// A ZIP package of several files, written as a stream: each file is read once, in chunks, so a
// large folder is never held in memory. Files are stored, not compressed (method 0): what goes in
// is usually already compressed (photos, videos, documents), and the package is encrypted next,
// which compression would only slow down. Names are UTF-8 (flag bit 11); each file's CRC-32 is
// only known once it has been read, so it follows the data in a data descriptor (flag bit 3), and
// the central directory at the end has every value. Windows Explorer, macOS Archive Utility and
// unzip all read this. No ZIP64: a package is limited to 4 GiB and 65,535 files, more than the
// page accepts (MAX_PACKAGE_BYTES in lib/files.ts).

export interface ZipEntry {
  /** Path inside the package, with "/" between folders. */
  path: string;
  file: Blob;
  /** Modification time, ms since the epoch (File.lastModified). */
  modified?: number;
}

export const ZIP_MAX_BYTES = 0xffffffff;
export const ZIP_MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO-HDLC, the one ZIP uses). Pass the previous value to continue over several chunks. */
export function crc32(bytes: Uint8Array, previous = 0): number {
  let c = ~previous;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** MS-DOS date and time, in local time as ZIP tools expect, clamped to the years DOS can hold. */
function dosDateTime(ms: number): [time: number, date: number] {
  const d = new Date(ms);
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return [
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  ];
}

/**
 * A safe path inside the package: "/" separators, no empty, "." or ".." parts, no drive letters
 * or control characters, so unpacking it can't write outside the folder it's unpacked into.
 */
export function zipPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
    .map((p) => p.replace(/[\u0000-\u001f:*?"<>|]/g, '_').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/') || 'file';
}

/** Makes every path unique ("notes.txt", "notes (2).txt"), keeping the order. */
export function uniquePaths(paths: string[]): string[] {
  const used = new Set<string>();
  return paths.map((p) => {
    let candidate = p;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      const dot = p.lastIndexOf('.');
      const slash = p.lastIndexOf('/');
      candidate = dot > slash + 1 ? `${p.slice(0, dot)} (${n})${p.slice(dot)}` : `${p} (${n})`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

const header = (size: number, fill: (v: DataView) => void): Uint8Array => {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
};

/** The size of the package for these entries, before writing it. */
export function zipSize(entries: ZipEntry[]): number {
  const enc = new TextEncoder();
  return entries.reduce((n, e) => n + 30 + 16 + 46 + 2 * enc.encode(zipPath(e.path)).length + e.file.size, 22);
}

/** A ZIP package of the entries, as a stream. Paths are made safe and unique first. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error(`A package holds at most ${ZIP_MAX_ENTRIES} files.`);
  if (zipSize(entries) > ZIP_MAX_BYTES) throw new Error('A package holds at most 4 GB.');
  const enc = new TextEncoder();
  const names = uniquePaths(entries.map((e) => zipPath(e.path))).map((p) => enc.encode(p));
  const central: Uint8Array[] = [];
  let offset = 0;
  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let crc = 0;
  let written = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const entry = entries[index];
      if (!entry) {
        // Central directory, then its end record.
        const start = offset;
        for (const c of central) { controller.enqueue(c); offset += c.length; }
        controller.enqueue(header(22, (v) => {
          v.setUint32(0, 0x06054b50, true);
          v.setUint16(8, central.length, true);
          v.setUint16(10, central.length, true);
          v.setUint32(12, offset - start, true);
          v.setUint32(16, start, true);
        }));
        controller.close();
        return;
      }
      const name = names[index]!;
      const [time, date] = dosDateTime(entry.modified ?? Date.now());
      if (!reader) {
        // Local file header; CRC and sizes follow the data (flag bit 3).
        const local = header(30 + name.length, (v) => {
          v.setUint32(0, 0x04034b50, true);
          v.setUint16(4, 20, true);              // version needed: 2.0
          v.setUint16(6, 0x0808, true);          // UTF-8 names, data descriptor
          v.setUint16(10, time, true);
          v.setUint16(12, date, true);
          v.setUint16(26, name.length, true);
        });
        local.set(name, 30);
        controller.enqueue(local);
        reader = entry.file.stream().getReader();
        crc = 0;
        written = 0;
        return;
      }
      const { done, value } = await reader.read();
      if (!done) {
        crc = crc32(value, crc);
        written += value.length;
        controller.enqueue(value);
        return;
      }
      reader = null;
      if (written !== entry.file.size) throw new Error(`${entry.path} changed while it was being read.`);
      controller.enqueue(header(16, (v) => {
        v.setUint32(0, 0x08074b50, true);
        v.setUint32(4, crc, true);
        v.setUint32(8, written, true);
        v.setUint32(12, written, true);
      }));
      const entryOffset = offset;
      offset += 30 + name.length + written + 16;
      const record = header(46 + name.length, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 0x0314, true);            // made by: Unix, 2.0 (so the permissions below count)
        v.setUint16(6, 20, true);
        v.setUint16(8, 0x0808, true);
        v.setUint16(12, time, true);
        v.setUint16(14, date, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, written, true);
        v.setUint32(24, written, true);
        v.setUint16(28, name.length, true);
        v.setUint32(38, (0o100644 << 16) >>> 0, true); // a regular file, rw-r--r--
        v.setUint32(42, entryOffset, true);
      });
      record.set(name, 46);
      central.push(record);
      index++;
    },
    cancel() { void reader?.cancel(); },
  });
}
