import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, buildRequest, getConfig } from "../server/ai.mjs";
import { personalize, reportSchema, requestSchema } from "../server/schema.mjs";
const fixture = {
  sourceType: "menu",
  title: "Test menu",
  readable: true,
  allergenListText: "",
  menuText: "Tofu with milk and soy",
  summary: "Milk and soy are listed.",
  legend: [],
  dishes: [
    {
      name: "Tofu",
      allergenCodes: [],
      description: "Milk and soy listed on menu",
      ingredients: ["milk", "tofu"],
      allergens: [
        { name: "Milk", evidence: "milk on menu", certainty: "declared" },
        { name: "Soybeans", evidence: "tofu", certainty: "declared" },
      ],
      uncertainties: ["Cross-contact unknown"],
      questions: ["Is separate equipment used?"],
    },
  ],
  warnings: [],
};
const input = {
  images: [],
  text: "Tofu with milk",
  profile: [{ name: "Milk", severity: "Critical" }],
};
const config = {
  provider: "openai-compatible",
  base: "https://example.test/v1",
  key: "secret-test",
  model: "vision-model",
  format: "json_schema",
};
const mock =
  (content, finish_reason = "stop") =>
  async () =>
    new Response(
      JSON.stringify({ choices: [{ finish_reason, message: { content } }] }),
      { status: 200 },
    );
test("critical preference applied deterministically and unknown allergens retained", () => {
  const r = personalize(fixture, input.profile);
  assert.equal(r.dishes[0].status, "Critical");
  assert.equal(r.dishes[0].allergens[1].severity, "Untracked");
});
test("absence of matched allergens never means safe", () => {
  const r = personalize(
    { ...fixture, dishes: [{ ...fixture.dishes[0], allergens: [] }] },
    input.profile,
  );
  assert.equal(r.dishes[0].status, "Uncertain");
  assert.match(r.warnings[0], /cross-contact/);
});
test("invalid image and duplicate profile rejected", () => {
  assert.equal(
    requestSchema.safeParse({
      ...input,
      images: [{ data: "https://bad.test/photo", kind: "menu" }],
    }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({
      ...input,
      profile: [...input.profile, ...input.profile],
    }).success,
    false,
  );
});
test("valid report parsed, personalized, and given server metadata", async () => {
  const r = await analyze(input, {
    config,
    fetchImpl: mock(JSON.stringify(fixture)),
  });
  assert.ok(r.id);
  assert.equal(r.model, "vision-model");
  assert.equal(r.dishes[0].status, "Critical");
});
test("malformed and structurally invalid provider responses rejected", async () => {
  for (const payload of ["not json", "{}"])
    await assert.rejects(
      analyze(input, { config, fetchImpl: mock(payload) }),
      /report format/,
    );
});
test("truncated, unreadable and missing-key results rejected", async () => {
  await assert.rejects(
    analyze(input, { config, fetchImpl: mock("{}", "length") }),
    /complete/,
  );
  await assert.rejects(
    analyze(input, {
      config,
      fetchImpl: mock(JSON.stringify({ ...fixture, readable: false })),
    }),
    /read/,
  );
  await assert.rejects(
    analyze(input, { config: { ...config, key: "" } }),
    /not connected/,
  );
});
test("provider errors do not leak credentials or upstream bodies", async () => {
  await assert.rejects(
    analyze(input, {
      config,
      fetchImpl: async () => new Response("secret-test", { status: 401 }),
    }),
    (e) => !e.message.includes("secret-test") && e.status === 502,
  );
});
test("OpenAI compatible request includes image data and schema", () => {
  const r = buildRequest(
    {
      ...input,
      images: [{ data: "data:image/png;base64,aGVsbG8=", kind: "menu" }],
    },
    config,
  );
  assert.equal(r.url, "https://example.test/v1/chat/completions");
  assert.equal(r.body.response_format.type, "json_schema");
  assert.equal(r.body.messages[1].content[2].type, "image_url");
});
test("JSON mode and plain mode retain server validation", () => {
  assert.equal(
    buildRequest(input, { ...config, format: "json_object" }).body
      .response_format.type,
    "json_object",
  );
  assert.equal(
    buildRequest(input, { ...config, format: "none" }).body.response_format,
    undefined,
  );
});
test("Gemini builds native request and parses valid response", async () => {
  const c = {
    ...config,
    provider: "gemini",
    base: "https://example.test/v1beta",
  };
  const req = buildRequest(
    {
      ...input,
      images: [{ data: "data:image/png;base64,aGVsbG8=", kind: "menu" }],
    },
    c,
  );
  assert.equal(req.body.contents[0].parts[2].inlineData.mimeType, "image/png");
  assert.ok(req.body.generationConfig.responseJsonSchema);
  const r = await analyze(input, {
    config: c,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(fixture) }] },
            },
          ],
        }),
      ),
  });
  assert.equal(r.dishes[0].status, "Critical");
});
test("provider config honors generic environment and legacy OpenAI key", () => {
  assert.equal(
    getConfig({ AI_API_KEY: "generic", OPENAI_API_KEY: "legacy" }).key,
    "generic",
  );
  assert.equal(getConfig({ OPENAI_API_KEY: "legacy" }).key, "legacy");
});

test('structured reports send the schema once; JSON-only providers still receive it', () => {
  const structured = buildRequest(input, config).body;
  const prompt = structured.messages[1].content[0].text;
  assert.ok(structured.response_format.json_schema.schema.properties.dishes);
  assert.ok(!prompt.includes('"properties"'));
  const jsonOnly = buildRequest(input, {...config,format:'json_object'}).body;
  assert.ok(jsonOnly.messages[1].content[0].text.includes('"properties"'));
});
test("hallucinated allergen categories are rejected", () => {
  assert.equal(
    reportSchema.safeParse({
      ...fixture,
      dishes: [
        {
          ...fixture.dishes[0],
          allergens: [{ name: "Magic", evidence: "", certainty: "declared" }],
        },
      ],
    }).success,
    false,
  );
});
