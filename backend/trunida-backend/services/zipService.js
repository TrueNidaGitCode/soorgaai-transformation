/**
 * Svarg — minimal ZIP writer
 *
 * Enough of the ZIP format to hand someone a downloadable project, written
 * against zlib rather than adding a dependency for one feature. Entries are
 * deflated, which every unzip tool understands.
 *
 * Deliberately not streaming: the delivered project is a few hundred
 * kilobytes of source, so building it in memory is simpler and the size is
 * known in advance, which lets the response carry a Content-Length.
 */

import zlib from 'zlib';

// ── CRC-32, which the format requires per entry ─────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

/** MS-DOS date/time, which is what the format stores. */
function dosTime(d = new Date()) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { time, date };
}

/**
 * @param {{path: string, content: string}[]} files
 * @param {string} [rootDir]  wraps everything in a folder, so unzipping into
 *                            a downloads directory does not scatter 32 files
 * @returns {Buffer}
 */
export function buildZip(files, rootDir = '') {
  const { time, date } = dosTime();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from((rootDir ? `${rootDir}/` : '') + f.path, 'utf8');
    const raw = Buffer.from(f.content ?? '', 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    // A file that deflates larger than it started is stored instead — legal,
    // and avoids a compressed archive being bigger than its contents.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);            // extra field length

    chunks.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);      // central directory header
    dir.writeUInt16LE(20, 4);              // version made by
    dir.writeUInt16LE(20, 6);              // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);              // extra
    dir.writeUInt16LE(0, 32);              // comment
    dir.writeUInt16LE(0, 34);              // disk number
    dir.writeUInt16LE(0, 36);              // internal attrs
    dir.writeUInt32LE(0, 38);              // external attrs
    dir.writeUInt32LE(offset, 42);         // offset of local header
    central.push(dir, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);        // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                // comment length

  return Buffer.concat([...chunks, centralBuf, end]);
}
