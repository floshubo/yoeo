# Analysis speed improvements

September 14, 2026. The Render instance plan and the production model (`gpt-4.1-mini`) are unchanged.

## Implemented

- Request compact JSON, concise evidence, and a short summary. Avoid repeated descriptions and general cross-contact advice on every dish. Preserve source transcriptions, original dish names, dish coverage, all detected allergens, and distinct uncertainties and questions. The server continues adding the standard safety notice and validating the entire report before returning it.
- Send the output schema once for structured-output requests. JSON-only and plain-output providers still receive the schema in the prompt.
- Track actual browser upload events, then display that the photos are uploaded and the app is waiting for analysis. Show elapsed time and a longer-wait explanation, without inventing an AI completion percentage. Keep cancellation and account/guest credentials working; ignore results from cancelled requests.
- Add English, German, and Chinese progress messages.

## Live synthetic benchmark

Two repetitions per variant and fixture, sequential requests, reversing variant order in the second repetition. All calls used the existing server API credentials from the local environment, directly against the provider; no user photos were transmitted. These are small diagnostic fixtures, not a comprehensive allergen-safety evaluation or an iPhone network benchmark.

| Fixture | Original mini mean | Concise mini mean | Change |
| --- | ---: | ---: | ---: |
| 20-dish menu image | 22.50 s | 16.16 s | 28% faster |
| Separate German menu and legend images | 8.40 s | 6.77 s | 19% faster |

All original and concise mini runs preserved expected dish names, dish count, expected allergens, milk severity, and printed codes checked by the fixtures. Concise mini used approximately 28% fewer output tokens for the 20-dish fixture.

The candidate `gpt-4.1-nano` was faster, but missed explicitly listed allergens in both 20-dish runs and changed an original German name in one run. It was rejected for production. Full measurements and failures are in `analysis-benchmark.json`; rerun with `node scripts/benchmark-analysis.mjs --live`. Set `YOEO_TOOLS_DIR` to a package directory containing `sharp` and configure the server API key locally. This makes paid provider calls.

The approach follows [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization). Candidate capabilities were checked against the [GPT-4.1 nano documentation](https://developers.openai.com/api/docs/models/gpt-4.1-nano).

## Verification and release

Automated tests cover request errors, cancellation, account headers, upload completion versus AI completion, schema delivery, and existing report validation. `scripts/analysis-progress-test.mjs` uses a real local upload and deliberately delayed response to check elapsed time, cancellation, retry, account headers, and results. The iPhone still needs a rebuilt native app to receive the progress display. Backend prompt improvements apply to existing clients after deployment.

Render Free startup delays remain possible, as requested. No model switch, hosting upgrade, image downsampling change, truncated report limit, or automatic retries were introduced.
