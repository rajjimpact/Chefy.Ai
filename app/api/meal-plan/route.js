import { NextResponse } from "next/server";
import { callGeminiWithRotation } from "../../lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { days = 5, diet = "balanced", people = 2 } = await request.json();

    const dietLabels = {
      balanced: "balanced and nutritious",
      vegetarian: "vegetarian (no meat or fish)",
      vegan: "vegan (no animal products at all)",
      "high-protein": "high-protein (focus on lean meats, legumes, eggs, dairy)",
      "low-carb": "low-carb / keto (minimal grains, sugars; healthy fats and proteins)",
      mediterranean: "Mediterranean (olive oil, fish, whole grains, vegetables, legumes)",
      indian: "Indian cuisine (spices, lentils, rice, roti, curries)",
    };

    const dietDesc = dietLabels[diet] || "balanced";

    const prompt = `Create a ${days}-day meal plan for ${people} person(s) following a ${dietDesc} diet.

For each day, provide breakfast, lunch, and dinner. Each meal should be practical, delicious, and achievable at home.

Reply ONLY with JSON in this EXACT format (no extra text, no markdown):
{
  "days": [
    {
      "day": "Monday",
      "totalCalories": "~2000 kcal",
      "breakfast": {
        "name": "Meal Name",
        "description": "Short 1-sentence description",
        "calories": "~400 kcal",
        "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"]
      },
      "lunch": {
        "name": "Meal Name",
        "description": "Short 1-sentence description",
        "calories": "~600 kcal",
        "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"]
      },
      "dinner": {
        "name": "Meal Name",
        "description": "Short 1-sentence description",
        "calories": "~700 kcal",
        "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"]
      }
    }
  ],
  "summary": "A 1-2 sentence motivational summary about this meal plan and its health benefits."
}

Generate exactly ${days} days. Name them by weekday (Monday, Tuesday, etc.). Keep ingredient lists to 4-6 items max.`;

    const customKey = request.headers.get("x-custom-gemini-key");

    const aiData = await callGeminiWithRotation(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 3000 },
      },
      customKey
    );

    const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let mealPlan;
    try {
      mealPlan = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI meal plan response:", rawText);
      return NextResponse.json(
        { error: "Failed to parse meal plan from AI response. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(mealPlan);
  } catch (error) {
    console.error("Meal plan route error:", error.message);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.message?.includes("quota") ? 429 : 500 }
    );
  }
}
