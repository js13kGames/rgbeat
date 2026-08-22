/**
 * Minimal ZIP writer tuned for the js13kGames byte budget.
 *
 * Why hand-rolled instead of a zip library or the `zip` CLI:
 *  - Every byte of container overhead is visible and controllable here. We emit
 *    no extra fields, no directory entries and no timestamps beyond the required
 *    DOS stamp, which a general-purpose library would happily add for us.
 *  - It removes a native-binary dependency. ECT (the tool the GDD suggests in
 *    Section 14) ships no Windows build via npm, so relying on it would make the
 *    repo unbuildable on Windows -- unacceptable for a repo the js13k org will
 *    clone and review.
 *
 * Compression uses Zopfli, a pure-JS deflate implementation that produces
 * smaller streams than zlib level 9 while staying 100% deflate-compatible (so
 * any unzip tool can read the result). We still compare against a stored
 * (uncompressed) entry and keep whichever is smaller.
 */
import { deflateRawSync } from 'node:zlib';
import zopfliPkg from '@gfx/zopfli';

// @gfx/zopfli is CommonJS; interop puts the real module on `.default` under ESM.
const zopfli = zopfliPkg.default || zopfliPkg;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// 1980-01-01, the earliest timestamp DOS can express. Using a fixed date keeps
// builds byte-for-byte reproducible; using zero would technically be an invalid
// month and makes some archive tools complain.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Zopfli's callback API, promisified. */
function zopfliDeflate(buf, numIterations) {
  return new Promise((resolve, reject) => {
    zopfli.deflate(buf, { numiterations: numIterations, blocksplitting: true }, (err, out) =>
      err ? reject(err) : resolve(out)
    );
  });
}

/**
 * Compress one entry, picking the smallest of Zopfli / zlib-9 / stored.
 * Falling back to zlib keeps the build working even if Zopfli ever fails, and
 * `store` wins for tiny files where deflate framing costs more than it saves.
 */
async function compress(data, numIterations) {
  const candidates = [{ method: METHOD_STORE, body: data }];

  candidates.push({ method: METHOD_DEFLATE, body: deflateRawSync(data, { level: 9 }) });

  try {
    candidates.push({ method: METHOD_DEFLATE, body: await zopfliDeflate(data, numIterations) });
  } catch (err) {
    console.warn(`  ! zopfli failed (${err.message}), falling back to zlib level 9`);
  }

  return candidates.reduce((best, c) => (c.body.length < best.body.length ? c : best));
}

/**
 * Build a zip archive in memory.
 * @param {{name: string, data: Buffer}[]} files
 * @param {{numIterations?: number}} [options]
 * @returns {Promise<Buffer>}
 */
export async function createZip(files, { numIterations = 100 } = {}) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const { method, body } = await compress(file.data, numIterations);
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed to extract (2.0 = deflate)
    local.writeUInt16LE(0, 6); // general purpose flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localChunks.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // archive comment length

  return Buffer.concat([...localChunks, centralDirectory, eocd]);
}
