function normalize(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

export function isAllowedOrigin(origin, env, fallbackOrigin) {
  if (!origin) return true;
  const allowed = new Set([
    normalize(env.APP_URL || fallbackOrigin),
    // Render hosts this same app alongside the separately hosted frontend.
    normalize(env.RENDER_EXTERNAL_URL),
    // Bundled iOS and Android origins when server configuration omits them.
    // An explicit value (including an empty string) can override the default.
    ...String(env.NATIVE_APP_ORIGINS ?? 'capacitor://localhost,http://localhost').split(',').map(normalize).filter(Boolean),
  ]);
  return allowed.has(normalize(origin));
}
