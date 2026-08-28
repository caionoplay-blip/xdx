
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERRO: GEMINI_API_KEY não encontrada no .env");
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    
    if (data.models) {
      console.log("--- MODELOS DISPONÍVEIS EM 2026 ---");
      data.models.forEach((m: any) => {
        console.log(`- ${m.name} (${m.displayName})`);
      });
    } else {
      console.log("Erro na resposta:", data);
    }
  } catch (e) {
    console.error("Falha na requisição:", e);
  }
}

listModels();
