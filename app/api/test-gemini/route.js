import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || process.env.GEMINI_API_KEY_1 || "";

  if (!key) {
    return NextResponse.json({ error: "No key. Use ?key=AIzaSy..." }, { status: 400 });
  }

  const keyPreview = key.slice(0, 8) + "..." + key.slice(-4);
  const results = [];

  const versions = ["v1", "v1beta"];
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"];
  const testBody = {
    contents: [{ parts: [{ text: "Say hello in one word." }] }],
    generationConfig: { maxOutputTokens: 10 },
  };

  for (const version of versions) {
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testBody),
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "(no text)";
          results.push({ version, model, status: res.status, success: true, response: text });
          // Found working combo — report it prominently
        } else {
          results.push({
            version, model, status: res.status, success: false,
            error: data?.error?.message?.slice(0, 120) || `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        results.push({ version, model, status: 0, success: false, error: err.message });
      }
    }
  }

  const working = results.filter((r) => r.success);
  return NextResponse.json({
    keyPreview,
    overallSuccess: working.length > 0,
    workingCombinations: working,
    allResults: results,
    envKeysSet: {
      GEMINI_API_KEY_1: !!process.env.GEMINI_API_KEY_1,
      GEMINI_API_KEY_2: !!process.env.GEMINI_API_KEY_2,
      GEMINI_API_KEY_3: !!process.env.GEMINI_API_KEY_3,
    },
  });
}
