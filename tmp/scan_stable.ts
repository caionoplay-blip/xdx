import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Chave de API não configurada." });
    }

    const ai = new GoogleGenAI({ apiKey });
    const imageData = image.includes(",") ? image.split(",")[1] : image;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Você é um especialista em leitura de etiquetas de supermercado. Extraia o NOME do produto e o PREÇO unitário da imagem. Retorne APENAS um JSON puro, sem markdown, no formato: {\"name\": \"string\", \"price\": number}. Se não conseguir ler com clareza, identifique o melhor possível." },
            { inlineData: { data: imageData, mimeType: "image/jpeg" } }
          ]
        }
      ]
    });

    let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json/g, "").replace(/```/g, "").replace(/^[^{\[]+/, "").replace(/[^}\]]+$/, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const priceMatch = text.match(/price["\s:]+([\d,.]+)/);
      const nameMatch = text.match(/name["\s:]+"([^"]+)"/);
      parsed = {
        name: nameMatch ? nameMatch[1] : "Item",
        price: priceMatch ? priceMatch[1] : 0
      };
    }

    if (parsed.price) {
      let p = parsed.price.toString().replace(/R\$\s?/, "").replace(/\s/g, "").replace(",", ".");
      parsed.price = parseFloat(p) || 0;
    }
    
    res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Erro no scanner (Vercel):", error);
    res.status(500).json({ 
      error: "Erro no processamento da IA",
      details: error.message || "Erro desconhecido"
    });
  }
}
