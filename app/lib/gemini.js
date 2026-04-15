/**
 * Gemini API key rotation helper.
 *
 * Tries each configured key in order.
 * Rotates to the next key on 429 (quota) AND on 400/401/403 (key issues).
 * Throws with a helpful message if all keys fail.
 */

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash", // fallback model
];

function makeApiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getKeys() {
  const raw = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ];

  // Only accept keys that look like valid Gemini API keys
  const keys = raw.filter((k) => k && k.trim().startsWith("AIzaSy"));

  console.log(
    `[Gemini] ${keys.length} valid system key(s) found out of ${raw.filter(Boolean).length} configured.`
  );

  return keys;
}

/**
 * Returns true if the error is key-specific (should rotate to next key).
 * Returns false if the error is a permanent/API-level error (fail immediately).
 */
function shouldRotate(statusCode, message = "") {
  if (statusCode === 429) return true;                                    // Quota exceeded
  if (statusCode === 401) return true;                                    // Unauthorized / invalid key
  if (statusCode === 403) return true;                                    // Forbidden / API not enabled
  if (statusCode === 400 && /expired|invalid.?key|api.?key/i.test(message)) return true; // Expired key
  return false;
}

/**
 * Try a single Gemini API key against multiple models.
 * Returns the response JSON on success, or throws with the last error.
 */
async function tryKeyWithModels(key, requestBody) {
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(`${makeApiUrl(model)}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        return { ok: true, data: await response.json() };
      }

      const errText = await response.text();
      let errJson = {};
      try { errJson = JSON.parse(errText); } catch { /* ignore */ }
      const message = errJson?.error?.message || errText;
      const statusCode = response.status;

      // If key-level issue, no point trying other models — signal key rotation
      if (shouldRotate(statusCode, message)) {
        return { ok: false, rotate: true, statusCode, message };
      }

      // Model-level error (e.g. model not found) — try next model
      console.warn(`[Gemini] Model ${model} error ${statusCode}: ${message.slice(0, 80)} — trying fallback model`);
      lastErr = { statusCode, message };

    } catch (err) {
      if (err.name === "TimeoutError" || err.message?.includes("Timeout")) {
        return { ok: false, rotate: true, statusCode: 503, message: "Connection timed out" };
      }
      throw err;
    }
  }
  // All models failed (non-key error)
  return { ok: false, rotate: false, ...lastErr };
}

/**
 * Call the Gemini API with automatic key rotation.
 *
 * @param {object} requestBody  - The full Gemini request body
 * @param {string} customKey    - Optional user-provided API key (tried first)
 * @returns {Promise<object>}   - Parsed Gemini JSON response
 * @throws {Error}              - If all keys fail, with a helpful message
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  const systemKeys = getKeys();

  // Build ordered key list: custom key first if valid
  let keys = [...systemKeys];
  if (customKey && customKey.trim().startsWith("AIzaSy")) {
    const trimmed = customKey.trim();
    keys = [trimmed, ...keys.filter((k) => k !== trimmed)];
    console.log("[Gemini] Using custom key as primary.");
  } else if (customKey && customKey.trim() !== "") {
    console.warn("[Gemini] Custom key has invalid format (must start with AIzaSy), ignoring.");
  }

  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys available. Open ⚙️ Settings and paste a fresh key from aistudio.google.com"
    );
  }

  let lastResult = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isCustom = customKey && key === customKey.trim();
    const label = isCustom ? "Custom Key" : `System Key ${i + 1}`;

    console.log(`[Gemini] Trying ${label}...`);
    const result = await tryKeyWithModels(key, requestBody);

    if (result.ok) {
      console.log(`[Gemini] ${label} succeeded ✓`);
      return result.data;
    }

    if (result.rotate) {
      console.warn(`[Gemini] ${label} failed (${result.statusCode}): ${String(result.message).slice(0, 100)} — rotating...`);
      lastResult = result;
      continue; // try next key
    }

    // Non-rotatable error — fail fast for real API errors
    throw new Error(result.message || "Gemini API error");
  }

  // All keys exhausted
  const code = lastResult?.statusCode;
  let finalMsg;

  if (code === 429) {
    finalMsg =
      "All API keys have hit their daily quota. Open ⚙️ Settings and paste a fresh key from aistudio.google.com — it works instantly without redeploying!";
  } else if (code === 400 || code === 401 || code === 403) {
    finalMsg =
      "All configured API keys are expired or invalid. Open ⚙️ Settings and paste a fresh Gemini API key from aistudio.google.com";
  } else {
    finalMsg = lastResult?.message || "All Gemini API keys failed.";
  }

  throw new Error(finalMsg);
}
