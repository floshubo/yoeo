/** Upload progress measures bytes sent, not AI completion. */
export function analysisRequest(url, body, { headers = {}, signal, onProgress = () => {}, createXHR = () => new XMLHttpRequest() } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const xhr = createXHR();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = error => { cleanup(); reject(error); };
    const abort = () => { xhr.abort(); fail(new DOMException('Cancelled', 'AbortError')); };
    // Attach upload listeners before open() for WebKit compatibility.
    xhr.upload.onprogress = event => {
      if (!signal?.aborted) onProgress({ phase: 'uploading', percent: event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null });
    };
    xhr.upload.onload = () => { if (!signal?.aborted) onProgress({ phase: 'waiting', percent: 100 }); };
    xhr.onload = () => {
      cleanup();
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText, contentType: xhr.getResponseHeader('Content-Type') || '' });
    };
    xhr.onerror = () => fail(new TypeError('Could not connect to the analysis server.'));
    xhr.ontimeout = () => fail(new Error('Analysis timed out. Try fewer photos or try again.'));
    xhr.onabort = () => fail(new DOMException('Cancelled', 'AbortError'));
    onProgress({ phase: 'uploading', percent: null });
    try {
      xhr.open('POST', url);
      xhr.timeout = 180000;
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      signal?.addEventListener('abort', abort, { once: true });
      xhr.send(body);
    } catch (error) { fail(error); }
  });
}
