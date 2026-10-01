import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
async function withApp(fn, options = {}) {
  const server = createApp(options).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("health reports readiness without exposing secrets", () =>
  withApp(
    async (base) => {
      const res = await fetch(base + "/api/health");
      const text = await res.text();
      assert.ok(!text.includes("supersecret"));
      assert.equal(res.headers.get("cache-control"), "no-store");
    },
    { env: { AI_API_KEY: "supersecret" } },
  ));
test("invalid payload rejected before provider called", () =>
  withApp(
    async (base) => {
      const r = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], profile: [] }),
      });
      assert.equal(r.status, 400);
    },
    {
      analyzeFn: () => {
        throw Error("must not be called");
      },
    },
  ));
test("cross-origin and missing access tokens rejected", () =>
  withApp(
    async (base) => {
      const a = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { origin: "https://evil.test" },
      });
      assert.equal(a.status, 403);
      const b = await fetch(base + "/api/analyze", { method: "POST" });
      assert.equal(b.status, 401);
    },
    { env: { APP_ACCESS_TOKEN: "private" } },
  ));
test("configured Capacitor origins receive a restricted CORS preflight", () =>
  withApp(
    async (base) => {
      const r = await fetch(base + "/api/analyze", {
        method: "OPTIONS",
        headers: { origin: "capacitor://localhost" },
      });
      assert.equal(r.status, 204);
      assert.equal(r.headers.get("access-control-allow-origin"), "capacitor://localhost");
      assert.match(r.headers.get("access-control-allow-headers"), /X-YOEO-Session/);
    },
    { env: { APP_URL: "https://yoeo.example", NATIVE_APP_ORIGINS: "capacitor://localhost,http://localhost" } },
  ));

test("iPhone and Android analysis work without an extra native-origin environment setting", () =>
  withApp(async base => {
    for (const origin of ['capacitor://localhost', 'http://localhost']) {
    const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-YOEO-Session': 'native-session' };
    const preflight = await fetch(base + '/api/analyze', {
      method: 'OPTIONS',
      headers: { Origin: headers.Origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-yoeo-session' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), headers.Origin);
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-YOEO-Session/);
    const result = await fetch(base + '/api/analyze', {
      method: 'POST', headers,
      body: JSON.stringify({ images: [], text: 'Milk soup', profile: [] }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('access-control-allow-origin'), headers.Origin);
    assert.equal((await result.json()).title, 'Native report');
    }
  }, { env: { APP_URL: 'https://yoeo.onrender.com' }, analyzeFn: async () => ({ title: 'Native report' }) }));

test("an explicit empty native-origin setting still disables native access", () =>
  withApp(async base => {
    const result = await fetch(base + '/api/analyze', { method: 'POST', headers: { Origin: 'capacitor://localhost' } });
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
  }, { env: { NATIVE_APP_ORIGINS: '' } }));

test('Render website, hosted frontend and native app share the restricted origin allowlist', () =>
  withApp(async base => {
    for (const origin of ['https://yoeo.onrender.com', 'https://frontend.example', 'capacitor://localhost', 'http://localhost']) {
      const preflight = await fetch(base + '/api/analyze', {method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});
      assert.equal(preflight.status,204);
      assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
      const response = await fetch(base + '/api/analyze', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({images:[],text:'Milk soup',profile:[]})});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('access-control-allow-origin'),origin);
    }
    const blocked = await fetch(base + '/api/analyze',{method:'POST',headers:{Origin:'https://unrelated.onrender.com'}});
    assert.equal(blocked.status,403);
    assert.equal(blocked.headers.get('access-control-allow-origin'),null);
  },{env:{APP_URL:'https://frontend.example',RENDER_EXTERNAL_URL:'https://yoeo.onrender.com',NATIVE_APP_ORIGINS:'capacitor://localhost,http://localhost'},analyzeFn:async()=>({title:'Origin check'})}));
test("valid text request reaches provider and returns report", () =>
  withApp(
    async (base) => {
      const r = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], text: "Milk soup", profile: [] }),
      });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).title, "Mock report");
    },
    {
      analyzeFn: async (input) => ({ title: "Mock report", text: input.text }),
    },
  ));
