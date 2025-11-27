import {GoogleGenAI, HarmBlockThreshold, HarmCategory} from "@google/genai";
import { Product } from "../types";

// Helper to clean JSON string from code blocks
const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Generates a makeup look based on the uploaded image and user's request.
 */
export const generateMakeupLook = async (imageBase64: string, userRequest: string = ""): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Build the prompt based on user request
    let prompt = '';
    if (userRequest.trim()) {
      prompt = `Apply makeup to this person based on the following request: "${userRequest}". Make sure the makeup style matches their request (e.g., if they ask for cool-tone pink lipstick, apply cool-tone pink lips; if they ask for natural look, apply light natural makeup). Keep the facial structure and identity identical, only apply virtual makeup. Photorealistic, 8k resolution.`;
    } else {
      prompt = 'Apply a sophisticated, high-fashion K-beauty makeup look to this person. Enhance skin texture to be glass-like, add soft coral-pink blush, defined eyeliner, and a gradient lip tint. Keep the facial structure identity identical, only apply virtual makeup. Photorealistic, 8k resolution.';
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }

    throw new Error("No image generated.");
  } catch (error) {
    console.error("Error generating look:", error);
    throw error;
  }
};


/**
 * Finds trending products based on keywords using Google Search Grounding.
 * Returns links to Olive Young Search Page.
 */
export const searchProducts = async (keywords: string): Promise<{ products: Product[], description: string }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      You are a K-Beauty Trend Expert.
      Perform a Google Search to find 5 currently trending/hot K-beauty products that match the style keywords: "${keywords}".
      
      Output Format (JSON Only):
      {
        "description": "A brief summary of why these products match the '${keywords}' style.",
        "recommendations": [
          {
            "brand": "Brand Name",
            "productName": "Specific Item Name (without brand)",
            "reason": "Why it fits the keyword"
          }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      }
    });

    const text = response.text || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanJsonString(text));
    } catch(e) {
      console.warn("JSON Parse failed", text);
      parsed = {};
    }

    const selectedProducts: Product[] = [];

    if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
      parsed.recommendations.forEach((rec: any, index: number) => {
        const brand = rec.brand || "";
        const itemName = rec.productName || rec.name || "";
        // Display string includes Brand for clarity
        const displayName = brand ? `${brand} - ${itemName}` : itemName;

        // Search query uses ONLY the product name as requested
        const query = encodeURIComponent(itemName);

        selectedProducts.push({
          id: `trend-${index}`,
          name: displayName,
          price: 0, // Not needed for list view
          thumbnailUrl: "", // Not needed for list view
          description: rec.reason || "Trending item matching your keywords.",
          url: `https://global.oliveyoung.com/display/search?query=${query}`
        });
      });
    }

    return {
      products: selectedProducts,
      description: parsed.description || `Trending products for "${keywords}"`
    };

  } catch (error) {
    console.error("Error searching products:", error);
    return {
      products: [],
      description: "Could not retrieve trending products at this moment."
    };
  }
};
