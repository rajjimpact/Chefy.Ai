/**
 * Gemini API helper — tries multiple API versions and model names.
 */

// Try v1 first, then v1beta (different models available on each)
const API_VERSIONS = ["v1", "v1beta"];

// Models to try in order (with common aliases)
const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-001",
];

function makeApiUrl(version, model) {
  return `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;
}

/**
 * Makes ONE Gemini API call with a specific key, version, and model.
 */
async function callGemini(key, version, model, requestBody) {
  const url = `${makeApiUrl(version, model)}?key=${key}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
  } catch (networkErr) {
    return { ok: false, status: 0, message: `Network error: ${networkErr.message}` };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, message: "Invalid response from Gemini API" };
  }

  if (response.ok) {
    return { ok: true, data: body };
  }

  const message = body?.error?.message || `HTTP ${response.status}`;
  return { ok: false, status: response.status, message };
}

/**
 * Trys all versions + models for a single key until one succeeds.
 * Returns { ok: true, data } or { ok: false, status, message }
 */
async function tryKey(key, label, requestBody) {
  for (const version of API_VERSIONS) {
    for (const model of MODELS) {
      const result = await callGemini(key, version, model, requestBody);

      if (result.ok) {
        console.log(`[Gemini] ✓ ${label} success: ${version}/${model}`);
        return { ok: true, data: result.data };
      }

      const { status, message } = result;
      console.warn(`[Gemini] ✗ ${label}/${version}/${model}: ${status} — ${String(message).slice(0, 80)}`);

      // 404 = model not found on this version → try next version/model
      if (status === 404) continue;

      // 429 = quota exceeded → try next model (might have different quota)
      if (status === 429) continue;

      // 400/401/403 = auth/key issue → skip remaining models for this key
      if (status === 400 || status === 401 || status === 403) {
        return { ok: false, status, message };
      }

      // Other errors → try next model
      continue;
    }
  }

  return { ok: false, status: 429, message: "All models exhausted for this key" };
}

/**
 * Main export: tries each key in order (custom key first).
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  // Build key list — custom key goes first
  const keys = [];

  if (customKey && customKey.trim()) {
    keys.push({ key: customKey.trim(), label: "Custom" });
  }

  const envEntries = [
    [process.env.GEMINI_API_KEY_1, "Env-1"],
    [process.env.GEMINI_API_KEY_2, "Env-2"],
    [process.env.GEMINI_API_KEY_3, "Env-3"],
  ];

  for (const [k, label] of envEntries) {
    if (k && k.trim().startsWith("AIzaSy")) {
      const trimmed = k.trim();
      if (!keys.some((x) => x.key === trimmed)) {
        keys.push({ key: trimmed, label });
      }
    }
  }

  console.log(`[Gemini] Attempting with keys: [${keys.map((k) => k.label).join(", ")}]`);

  if (keys.length === 0) {
    throw new Error(
      "No API keys found. Go to aistudio.google.com → Get API key → paste in ⚙️ Settings"
    );
  }

  for (const { key, label } of keys) {
    const result = await tryKey(key, label, requestBody);

    if (result.ok) return result.data;

    // Auth errors (bad key) → skip to next key
    if (result.status === 400 || result.status === 401 || result.status === 403) {
      console.warn(`[Gemini] Skipping ${label} (auth error ${result.status})`);
      continue;
    }

    // For quota errors, still try other keys
    continue;
  }

  // All keys + all models failed
  throw new Error(
    "All API keys failed. Please go to aistudio.google.com, create a new API key, and add it in ⚙️ Settings."
  );
}
