import http from 'node:http';

/** A tiny fake of the YouCam V2 API. Pass `opts` to script behaviour per test. */
export async function startMockYoucam(opts = {}) {
  const state = {
    calls: [],
    uploads: 0,
    taskPolls: 0,
    createAttempts: 0,
    pendingPolls: opts.pendingPolls ?? 2,
    createFails429Times: opts.createFails429Times ?? 0,
    taskError: opts.taskError ?? false,
    costBody: opts.costBody ?? { data: [{ name: 'AI Skin Tone Analysis', unit: 3 }, { name: 'AI Clothes', unit: 5 }] },
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      state.calls.push(`${req.method} ${req.url}`);
      const json = (status, payload, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(payload));
      };
      const auth = req.headers.authorization;
      if (req.url.startsWith('/s2s') && auth !== 'Bearer test-key') return json(401, { status: 401, error: 'Invalid API key' });

      const base = `http://127.0.0.1:${server.address().port}`;
      if (req.method === 'GET' && req.url === '/s2s/v2.0/credit/feature-cost') return json(200, { status: 200, ...state.costBody });
      if (req.method === 'POST' && req.url === '/s2s/v2.0/file') {
        const f = JSON.parse(body).files[0];
        return json(200, {
          status: 200,
          data: { files: [{ ...f, file_id: `file-${++state.uploads}`, requests: [{ method: 'PUT', url: `${base}/bucket/${state.uploads}`, headers: { 'Content-Type': f.content_type, 'Content-Length': String(f.file_size) } }] }] },
        });
      }
      if (req.method === 'PUT' && req.url.startsWith('/bucket/')) {
        res.writeHead(200);
        return res.end();
      }
      if (req.method === 'POST' && req.url.startsWith('/s2s/v2.0/task/')) {
        state.createAttempts += 1;
        if (state.createAttempts <= state.createFails429Times) return json(429, { status: 429, error: 'Too many requests' }, { 'retry-after': '0' });
        state.lastCreatePayload = JSON.parse(body);
        return json(200, { status: 200, data: { task_id: 'task-1' } });
      }
      if (req.method === 'GET' && req.url.startsWith('/s2s/v2.0/task/')) {
        state.taskPolls += 1;
        if (state.taskError) return json(200, { status: 200, data: { task_status: 'error', error: 'error_no_face' } });
        if (state.taskPolls <= state.pendingPolls) return json(200, { status: 200, data: { task_status: 'running', polling_interval: 1 } });
        return json(200, { status: 200, data: { task_status: 'success', results: { skin: { color: '#c58c6b' }, url: `${base}/result.jpg` } } });
      }
      return json(404, { status: 404, error: 'not found' });
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { state, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

import pino from 'pino';

export const silentLogger = pino({ level: 'silent' });

/** Builds the smallest buffer our image reader accepts. Not a viewable image. */
export function fakeJpeg(width, height, { orientation } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const exif = Buffer.alloc(8 + 2 + 12 + 4);
    exif.write('MM', 0, 'ascii');
    exif.writeUInt16BE(42, 2);
    exif.writeUInt32BE(8, 4);
    exif.writeUInt16BE(1, 8);
    exif.writeUInt16BE(0x0112, 10);
    exif.writeUInt16BE(3, 12);
    exif.writeUInt32BE(1, 14);
    exif.writeUInt16BE(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), exif]);
    const hdr = Buffer.alloc(4);
    hdr[0] = 0xff; hdr[1] = 0xe1; hdr.writeUInt16BE(body.length + 2, 2);
    parts.push(hdr, body);
  }
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(height, 5); sof.writeUInt16BE(width, 7); sof[9] = 3;
  parts.push(sof, Buffer.alloc(32));
  return Buffer.concat(parts);
}

export function fakePng(width, height) {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** In-memory stand-ins so intake routes can be tested without Mongo or Cloudinary. */
export function createMemorySessions(ids = ['sess-1']) {
  const docs = new Map(ids.map((id) => [id, { _id: id, expiresAt: new Date(Date.now() + 3_600_000), photos: {} }]));
  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o[k] ??= {}; o = o[k]; });
    o[keys.at(-1)] = value;
  };
  const unsetPath = (obj, path) => {
    const keys = path.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) { o = o?.[k]; if (!o) return; }
    delete o[keys.at(-1)];
  };
  return {
    docs,
    create: async () => ({ id: 'sess-1', expiresAt: new Date(Date.now() + 1000) }),
    get: async (id) => (docs.has(id) ? structuredClone(docs.get(id)) : null),
    patch: async (id, { set = {}, unset = [] } = {}) => {
      const d = docs.get(id);
      if (!d) return null;
      Object.entries(set).forEach(([k, v]) => setPath(d, k, v));
      unset.forEach((k) => unsetPath(d, k));
      return structuredClone(d);
    },
    remove: async (id) => { docs.delete(id); },
  };
}

export { createMemoryStorage } from './fakes.js';
