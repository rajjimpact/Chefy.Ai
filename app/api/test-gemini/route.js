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

  // 2025 AI Studio models only
  const models = [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
  ];

  const testBody = {
    contents: [{ parts: [{ text: "Say hello in one word." }] }],
    generationConfig: { maxOutputTokens: 10 },
  };

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
        results.push({ model, status: res.status, success: true, response: text });
      } else {
        results.push({
          model,
          status: res.status,
          success: false,
          error: data?.error?.message?.slice(0, 150) || `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      results.push({ model, status: 0, success: false, error: err.message });
    }
  }

  const working = results.filter((r) => r.success);
  return NextResponse.json({
    keyPreview,
    overallSuccess: working.length > 0,
    workingModels: working.map((r) => r.model),
    results,
    envKeysSet: {
      GEMINI_API_KEY_1: !!process.env.GEMINI_API_KEY_1,
      GEMINI_API_KEY_2: !!process.env.GEMINI_API_KEY_2,
      GEMINI_API_KEY_3: !!process.env.GEMINI_API_KEY_3,
    },
    note: "If all show 429, wait 2 minutes and test again — it is a rate limit, not a key error.",
  });
}
