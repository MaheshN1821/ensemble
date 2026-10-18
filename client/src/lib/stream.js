import { apiUrl } from './api.js';

/**
 * Reads a Server-Sent Events stream with fetch, because EventSource cannot send the session header.
 * Calls onEvent({ event, data }) for each message and resolves when the server ends the stream.
 * Throws on a failed connection so the caller can fall back to polling.
 */
export async function streamEvents(path, { sessionId, signal, onEvent }) {
  const res = await fetch(apiUrl(path), { headers: { 'X-Session-Id': sessionId, Accept: 'text/event-stream' }, signal });
  if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // keep-alive comment
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent({ event, data: data.join('\n') });
    }
  }
}
