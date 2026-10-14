/* Slip reader – runs Tesseract (Thai + English) inside a Web Worker on the guest's phone.
 * Messages in:  { id, cmd: 'init' }  |  { id, cmd: 'read', image: ArrayBuffer }
 * Messages out: { id, ok, text?, error? }  and  { progress: 'stage text' }                  */
'use strict';
const BASE = self.location.href.replace(/[^/]*$/, '');
const LANGS = ['tha', 'eng'];
let ready = null, M = null, api = null;

function hasSimd() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) { return false; }
}

async function bytesOf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download failed ' + r.status + ' ' + url);
  let buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {                 // gzip → inflate in the browser
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return buf;
}

function init() {
  if (ready) return ready;
  ready = (async () => {
    self.postMessage({ progress: 'loading' });
    importScripts(BASE + (hasSimd() ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'));
    const [mod, ...langs] = await Promise.all([
      self.TesseractCore({ locateFile: f => BASE + f }),
      ...LANGS.map(l => bytesOf(BASE + l + '.traineddata.gz'))
    ]);
    M = mod;
    LANGS.forEach((l, i) => M.FS.writeFile('/' + l + '.traineddata', langs[i]));
    api = new M.TessBaseAPI();
    if (api.Init('/', LANGS.join('+'), 1) !== 0) throw new Error('tesseract init failed');
    api.SetVariable('preserve_interword_spaces', '1');
    self.postMessage({ progress: 'ready' });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

self.onmessage = async e => {
  const { id, cmd, image } = e.data || {};
  try {
    await init();
    if (cmd === 'read') {
      self.postMessage({ progress: 'reading' });
      M.FS.writeFile('/input', new Uint8Array(image));
      if (api.SetImageFile(1, 0) === 1) throw new Error('cannot read image');
      api.Recognize(null);
      const text = api.GetUTF8Text();
      api.Clear();
      self.postMessage({ id, ok: true, text });
    } else {
      self.postMessage({ id, ok: true });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
