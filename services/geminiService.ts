import { GoogleGenAI } from "@google/genai";
import { Product, FacialMetric } from "../types";

// Helper to clean JSON string from code blocks
const cleanJsonString = (str: string) => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

const getImageUrl = (path: string) => {
  if (path.startsWith('http')) return path;
  // Remove leading slash to ensure clean concatenation if API returns relative path like /uploads/...
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://cdn-image.oliveyoung.com/${cleanPath}`;
};

interface OliveYoungItem {
  prdtName: string;
  prdtNo: string;
  saleAmt: string;
  imagePath: string;
}

// Fallback data in case the API/Proxy fails (to ensure the demo works)
const FALLBACK_PRODUCTS: OliveYoungItem[] = [
  {
    prdtName: "COSRX Advanced Snail 96 Mucin Power Essence 100ml",
    prdtNo: "GA210410161",
    saleAmt: "19.00",
    imagePath: "https://image.oliveyoung.com/uploads/images/goods/550/10/0000/0014/A00000014557907ko.jpg?l=ko"
  },
  {
    prdtName: "Round Lab 1025 Dokdo Toner 200ml",
    prdtNo: "GA210001004",
    saleAmt: "17.00",
    imagePath: "https://image.oliveyoung.com/uploads/images/goods/550/10/0000/0012/A00000012727605ko.jpg?l=ko"
  },
  {
    prdtName: "Beauty of Joseon Relief Sun : Rice + Probiotics 50ml",
    prdtNo: "GA220615365",
    saleAmt: "18.00",
    imagePath: "https://image.oliveyoung.com/uploads/images/goods/550/10/0000/0016/A00000016643209ko.jpg?l=ko"
  },
  {
    prdtName: "Torriden Dive-In Low Molecular Hyaluronic Acid Serum 50ml",
    prdtNo: "GA210002192",
    saleAmt: "22.00",
    imagePath: "https://image.oliveyoung.com/uploads/images/goods/550/10/0000/0013/A00000013328205ko.jpg?l=ko"
  },
  {
    prdtName: "CLIO Kill Cover Mesh Glow Cushion",
    prdtNo: "GA221217316",
    saleAmt: "28.00",
    imagePath: "https://image.oliveyoung.com/uploads/images/goods/550/10/0000/0017/A00000017448805ko.jpg?l=ko"
  }
];

const FALLBACK_REASONS = [
  "Essential for achieving that signature K-Beauty glass skin finish.",
  "A top-rated favorite known for its hydrating and soothing properties.",
  "Perfect for creating a natural, radiant look suitable for daily wear.",
  "Highly effective for enhancing skin texture and tone to match the generated look."
];

const GOOGLE_SEARCH_TOOL = [{ googleSearchRetrieval: {} }];

const DEFAULT_METRICS: FacialMetric[] = [
  { label: "Eyes Beauty", score: 85 },
  { label: "Cheeks Harmony", score: 82 },
  { label: "Lips Shape", score: 84 },
  { label: "Eyebrows Design", score: 80 },
  { label: "Jaw & Chin Definition", score: 83 },
  { label: "Facial Symmetry", score: 86 },
  { label: "OVERALL SCORE", score: 85 }
];

/**
 * Fetches best-selling products from Olive Young using a CORS proxy.
 */
const fetchOliveYoungProducts = async (): Promise<OliveYoungItem[]> => {
  try {
    // Try multiple CORS proxies in order
    const targetUrl = 'https://global.oliveyoung.com/display/product/best-seller/order-best';
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const proxyUrl of proxies) {
      try {
        console.log(`Trying proxy: ${proxyUrl}`);
        const response = await fetch(proxyUrl, {
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          console.warn(`Proxy request failed: ${response.status}`);
          continue;
        }

        const data = await response.json();

        // Check if data is array, or wrapped
        let items: OliveYoungItem[] = [];
        if (Array.isArray(data)) {
          items = data;
        } else if (data && Array.isArray(data.data)) {
          items = data.data;
        }

        if (items.length > 0) {
          // Validating required fields
          const validItems = items.filter(item => item.prdtName && item.prdtNo).slice(0, 50);
          if (validItems.length > 0) {
            console.log(`Successfully fetched ${validItems.length} products`);
            return validItems;
          }
        }
      } catch (err) {
        console.warn(`Proxy ${proxyUrl} failed:`, err);
        continue;
      }
    }

    console.warn("All proxies failed, using fallback data");
    return FALLBACK_PRODUCTS;
  } catch (error) {
    console.error("Failed to fetch Olive Young products, using fallback:", error);
    return FALLBACK_PRODUCTS;
  }
};

/**
 * Generates a facial diagnostic poster plus JSON metrics.
 */
export const generateFacialReport = async (
  imageBase64: string
): Promise<{ reportImage: string; summary: string; metrics: FacialMetric[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const overlayPrompt = `Use the provided portrait photo <YOUR PHOTO> as the base.
Do NOT change the person’s face, expression, age, skin tone or gender. Just overlay a clean, minimal infographic on top.
Create a high-resolution vertical “FACIAL AESTHETIC REPORT” poster, studio lighting, soft beige background, premium beauty clinic style.
The subject can be MALE or FEMALE – keep them exactly as in the original photo.
Add thin white lines and labels pointing to each area of the REAL face, with percentage scores based on global aesthetic ratios, symmetry and proportions (do not change the face):
1. Eyes: Label near the eyes with a line pointing to them: “Eyes Beauty – XX%”
2. Cheeks: Label near the cheekbones: “Cheeks Harmony – XX%”
3. Lips: Label close to the mouth: “Lips Shape – XX%”
4. Eyebrows: Label above or beside the brows: “Eyebrows Design – XX%”
5. Jaw & Chin: Label near the jawline and chin: “Jaw & Chin Definition – XX%”
6. Overall Facial Symmetry: Label near the center of the face: “Facial Symmetry – XX%”
At the bottom center of the poster, add a BIG, bold number inside a circle or rectangle:
“OVERALL SCORE: XX%”
Design style:
– clean, medical-grade, aesthetic-clinic infographic
– modern thin sans-serif typography
– white text and lines, subtle drop shadows
– no logos, no extra graphics, no text other than the labels and scores above.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
          {
            text: overlayPrompt,
          },
        ],
      },
      tools: GOOGLE_SEARCH_TOOL,
    });

    let reportImage = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        reportImage = part.inlineData.data;
        break;
      }
    }

    if (!reportImage) {
      throw new Error("No diagnostic image returned.");
    }

    const analysisPrompt = `
      You are an aesthetic clinic expert. Study the person's actual facial proportions in the provided image and produce a JSON object with:
      {
        "summary": "One elegant paragraph describing the overall aesthetic diagnosis.",
        "metrics": [
          {"label":"Eyes Beauty","score":92},
          {"label":"Cheeks Harmony","score":85},
          {"label":"Lips Shape","score":88},
          {"label":"Eyebrows Design","score":80},
          {"label":"Jaw & Chin Definition","score":90},
          {"label":"Facial Symmetry","score":89},
          {"label":"OVERALL SCORE","score":90}
        ]
      }
      Rules:
      - Scores are integers 50-100 based on harmony and symmetry.
      - Use the exact labels above.
      - Summary should reference notable strengths/opportunities referencing the scores.
    `;

    const analysisResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
          { text: analysisPrompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
      tools: GOOGLE_SEARCH_TOOL,
    });

    const analysisText = analysisResponse.text || "";
    let summary = "A refined, data-informed facial aesthetic snapshot.";
    let metrics: FacialMetric[] = DEFAULT_METRICS;

    if (analysisText) {
      try {
        const parsed = JSON.parse(cleanJsonString(analysisText));
        if (parsed.summary) summary = parsed.summary;
        if (Array.isArray(parsed.metrics) && parsed.metrics.length >= 6) {
          metrics = parsed.metrics.map((metric: FacialMetric) => ({
            label: metric.label,
            score: Number(metric.score),
          }));
        }
      } catch (err) {
        console.warn("Failed to parse diagnostic metrics, using defaults.", err);
      }
    }

    return { reportImage, summary, metrics };
  } catch (error) {
    console.error("Error generating facial report:", error);
    return {
      reportImage: "",
      summary: "Unable to generate the facial report. Please retry with a clearer portrait.",
      metrics: DEFAULT_METRICS,
    };
  }
};

/**
 * Generates a makeup look leveraging the user's request, research, and diagnosis.
 */
export const generateMakeupLook = async (
  imageBase64: string,
  userRequest: string = "",
  researchNotes: string = "",
  diagnosisSummary: string = ""
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const trimmedRequest = userRequest.trim();
    const trimmedNotes = researchNotes.trim();
    const trimmedDiagnosis = diagnosisSummary.trim();

    const prompt = `
      You are a celebrity-level K-Beauty makeup artist.
      Base the virtual makeover on:
      - USER REQUEST: ${trimmedRequest || "Deliver a polished, wearable Korean beauty glow."}
      - RESEARCH NOTES: ${trimmedNotes || "None provided."}
      - DIAGNOSIS SUMMARY: ${trimmedDiagnosis || "No diagnostic context, rely on standard flattering ratios."}
      Apply photorealistic makeup that respects the subject's existing identity, undertone, and features. Keep the face, gender, and expression identical. Ultra high-res, cinematic studio lighting.
    `;

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
      tools: GOOGLE_SEARCH_TOOL,
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
 * Analyzes the image and selects matching products from Olive Young's best sellers.
 */
export const searchProducts = async (
  imageBase64: string,
  userRequest: string = "",
  researchNotes: string = "",
  diagnosisSummary: string = ""
): Promise<{ products: Product[]; description: string }> => {
  try {
    // 1. Fetch real product data first
    const availableProducts = await fetchOliveYoungProducts();

    // Fallback if API completely fails (should not happen due to fallback data)
    if (availableProducts.length === 0) {
      throw new Error("No products available");
    }

    // Simplify product list for Gemini context window to save tokens
    const productListContext = availableProducts.map(p => ({
      id: p.prdtNo,
      name: p.prdtName,
      price: p.saleAmt
    }));

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 2. Ask Gemini to pick from the list
    const trimmedRequest = userRequest.trim();
    const trimmedNotes = researchNotes.trim();
    const trimmedDiagnosis = diagnosisSummary.trim();

    const prompt = `
      You are a professional K-Beauty consultant.
      1. Analyze the user's face in the image.
      2. User request: ${trimmedRequest || "Provide a balanced, flattering upgrade."}
      3. Research notes sourced from YouTube/Google/etc.: ${trimmedNotes || "None."}
      4. Facial diagnosis summary: ${trimmedDiagnosis || "Not available."}
      5. I have provided a list of currently trending Best Seller products from Olive Young below.
      6. Select exactly 4 products from this list that would best create a customized look aligned with the context above.
      7. For each product, provide a persuasive reason that references the request, diagnosis, or research when relevant.
      8. Return a JSON object.

      AVAILABLE PRODUCTS JSON:
      ${JSON.stringify(productListContext)}

      RESPONSE FORMAT:
      {
        "description": "A short, elegant description of the makeup style (max 2 sentences).",
        "recommendations": [
          {
            "id": "The exact 'id' from the provided list",
            "reason": "A specific, convincing reason why this product is recommended for this look."
          }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      },
      tools: GOOGLE_SEARCH_TOOL
    });

    const text = response.text || "";
    const parsed = JSON.parse(cleanJsonString(text));
    
    // 3. Merge Gemini's selection with real API data
    const selectedProducts: Product[] = [];
    
    if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
      for (const rec of parsed.recommendations) {
        const realProduct = availableProducts.find(p => p.prdtNo === rec.id);
        if (realProduct) {
          selectedProducts.push({
            id: realProduct.prdtNo,
            name: realProduct.prdtName,
            price: parseFloat(realProduct.saleAmt),
            thumbnailUrl: getImageUrl(realProduct.imagePath),
            description: rec.reason || "Recommended for you.",
            url: `https://global.oliveyoung.com/product/detail?prdtNo=${realProduct.prdtNo}`
          });
        }
      }
    }

    // If Gemini failed to pick valid IDs, just take top 4 from available
    if (selectedProducts.length === 0) {
       for (let i = 0; i < 4; i++) {
         if (availableProducts[i]) {
            const p = availableProducts[i];
            selectedProducts.push({
              id: p.prdtNo,
              name: p.prdtName,
              price: parseFloat(p.saleAmt),
              thumbnailUrl: getImageUrl(p.imagePath),
              description: FALLBACK_REASONS[i % FALLBACK_REASONS.length],
              url: `https://global.oliveyoung.com/product/detail?prdtNo=${p.prdtNo}`
            });
         }
       }
    }

    return {
      products: selectedProducts,
      description: parsed.description || "A custom curated look for you."
    };

  } catch (error) {
    console.error("Error searching products:", error);
    return {
      products: [],
      description: "Could not retrieve specific products at this moment."
    };
  }
};
