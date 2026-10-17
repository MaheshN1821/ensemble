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
