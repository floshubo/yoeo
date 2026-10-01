import { spawn } from "node:child_process";

const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$inputJson = [Console]::In.ReadToEnd()
$request = $inputJson | ConvertFrom-Json
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(120)
$message = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, [string]$request.url)
foreach ($property in $request.headers.PSObject.Properties) {
  [void]$message.Headers.TryAddWithoutValidation($property.Name, [string]$property.Value)
}
$message.Content = [System.Net.Http.StringContent]::new([string]$request.body, [System.Text.Encoding]::UTF8, 'application/json')
try {
  $response = $client.SendAsync($message).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  [Console]::Out.Write((@{ status = [int]$response.StatusCode; body = $body } | ConvertTo-Json -Compress))
} finally {
  $message.Dispose()
  $client.Dispose()
}
`;

const encodedScript = Buffer.from(script, "utf16le").toString("base64");

export function windowsFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    const errors = [];
    const abort = () => child.kill();
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) return reject(options.signal.reason || new Error("Request aborted"));
      if (code !== 0) return reject(new Error(`Windows HTTP transport failed (${code}): ${Buffer.concat(errors).toString().slice(0, 300)}`));
      try {
        const result = JSON.parse(Buffer.concat(output).toString());
        resolve(new Response(result.body, { status: result.status, headers: { "Content-Type": "application/json" } }));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ url, headers: options.headers || {}, body: options.body || "" }));
  });
}
