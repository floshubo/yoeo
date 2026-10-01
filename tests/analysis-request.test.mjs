import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisRequest } from '../src/analysisRequest.mjs';

function fakeXHR() {
  return { upload: {}, headers: {}, open(method, url) { this.method = method; this.url = url; },
    setRequestHeader(key, value) { this.headers[key] = value; }, send(body) { this.body = body; },
    abort() { this.aborted = true; this.onabort?.(); }, getResponseHeader() { return 'application/json'; } };
}
test('upload completion means waiting, not completed AI results; account headers survive', async () => {
  const xhr = fakeXHR(), events = [];
  let completed = false;
  const request = analysisRequest('/api/analyze', '{"images":[]}', { headers: {'X-YOEO-Session':'fixture'}, createXHR: () => xhr, onProgress: p => events.push(p) });
  request.then(() => { completed = true; });
  xhr.upload.onprogress({lengthComputable:true,loaded:25,total:100});
  assert.deepEqual(events.at(-1), {phase:'uploading',percent:25});
  xhr.upload.onload();
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(events.at(-1), {phase:'waiting',percent:100});
  assert.equal(xhr.headers['X-YOEO-Session'], 'fixture');
  xhr.status = 200; xhr.responseText = '{"title":"Result"}'; xhr.onload();
  assert.equal((await request).ok, true);
});
test('HTTP quota errors are returned for the scanner to handle', async () => {
  const xhr = fakeXHR();
  const request = analysisRequest('/api/analyze', '{}', {createXHR:()=>xhr});
  xhr.status = 402; xhr.responseText = '{"code":"SCAN_LIMIT_REACHED"}'; xhr.onload();
  const response = await request;
  assert.equal(response.ok, false);
  assert.equal(JSON.parse(response.text).code, 'SCAN_LIMIT_REACHED');
});
test('cancellation stops upload and rejects without a result', async () => {
  const xhr = fakeXHR(), controller = new AbortController();
  const request = analysisRequest('/api/analyze', '{}', {createXHR:()=>xhr,signal:controller.signal});
  controller.abort();
  await assert.rejects(request, {name:'AbortError'});
  assert.equal(xhr.aborted, true);
});
test('network failure and timeout end the wait with distinct errors', async () => {
  for (const event of ['onerror','ontimeout']) {
    const xhr = fakeXHR();
    const request = analysisRequest('/api/analyze', '{}', {createXHR:()=>xhr});
    xhr[event]();
    await assert.rejects(request, event === 'onerror' ? TypeError : /timed out/);
  }
});
