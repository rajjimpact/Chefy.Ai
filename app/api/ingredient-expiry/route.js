import { NextResponse } from "next/server";
import { callGeminiWithRotation } from "../../lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { ingredients } = await request.json();

    if (!ingredients || ingredients.length === 0) {
      return NextResponse.json(
        { error: "No ingredients provided" },
        { status: 400 }
      );
    }

    const today = new Date();

    // Build a rich description for each ingredient
    const ingredientDescriptions = ingredients.map((item) => {
      // item can be an object { name, purchaseDate, quantity, type } or just a string
      if (typeof item === "string") return `- ${item}`;

      const parts = [`- ${item.name}`];

      if (item.type) {
        const typeLabel = {
          fresh: "Fresh",
          frozen: "Frozen",
          dried: "Dried/Dehydrated",
          canned: "Canned/Packaged",
          cooked: "Cooked/Leftover",
        }[item.type] || item.type;
        parts.push(`Type: ${typeLabel}`);
      }

      if (item.quantity) parts.push(`Quantity: ${item.quantity}`);

      if (item.purchaseDate) {
        const purchased = new Date(item.purchaseDate + "T00:00:00");
        const daysElapsed = Math.floor((today - purchased) / (1000 * 60 * 60 * 24));
        parts.push(`Purchased: ${daysElapsed} day(s) ago (${item.purchaseDate})`);
      }

      return parts.join(", ");
    });

    const ingredientList = ingredientDescriptions.join("\n");

    const prompt = `I have these ingredients with their details:\n${ingredientList}

For each ingredient, consider the TYPE (fresh/frozen/dried/canned/cooked), how many DAYS AGO it was purchased (if provided), and the QUANTITY. Use this to give personalised freshness advice.

For each ingredient, tell me:
1. How long it typically lasts (shelf life) at room temperature, in the fridge, and in the freezer — adjusted for its TYPE.
2. Based on days elapsed since purchase, how much time is realistically LEFT before it goes bad.
3. Signs it has gone bad (spoilage indicators).
4. The best way to store it (specific to its current state/type).
5. A personalised tip on when to use it for best flavor/nutrition.

Reply ONLY with JSON in this exact format (no extra text, no markdown):
{
  "items": [
    {
      "name": "Ingredient Name",
      "type": "fresh/frozen/dried/canned/cooked",
      "category": "Fruit/Vegetable/Meat/Dairy/Grain/Spice/Other",
      "shelfLife": {
        "roomTemp": "X days/weeks",
        "fridge": "X days/weeks",
        "freezer": "X months"
      },
      "remainingLife": "Approx X days/weeks remaining based on purchase date (or 'Unknown' if date not given)",
      "spoilageSigns": ["sign 1", "sign 2"],
      "storageMethod": "How to store it properly given its current state",
      "usageTip": "Personalised tip based on days elapsed and type",
      "urgency": "use-now/use-soon/can-wait"
    }
  ],
  "summary": "A short personalised tip about using these specific ingredients together before they spoil, considering their purchase dates and types."
}

urgency values:
- "use-now" = use within 1-2 days (or already borderline)
- "use-soon" = use within 3-5 days
- "can-wait" = use within a week or more`;

    const customKey = request.headers.get("x-custom-gemini-key");

    const geminiData = await callGeminiWithRotation(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      customKey
    );

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let expiryData;
    try {
      expiryData = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", rawText);
      return NextResponse.json(
        { error: "Failed to parse expiry info from AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(expiryData);
  } catch (error) {
    console.error("Route error:", error.message);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.message?.includes("quota") ? 429 : 500 }
    );
  }
}
