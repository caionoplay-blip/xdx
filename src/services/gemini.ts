export interface ProductInfo {
  id?: string;
  name: string;
  price: number;
  rawText?: string;
  isWeightBased?: boolean;
  estimatedWeightG?: number;
}

export async function scanPriceTag(base64Image: string): Promise<ProductInfo | null> {
  try {
    const isMobileApp = !!(window as any).Capacitor;
    const baseUrl = isMobileApp ? 'https://xdx-lovat.vercel.app' : '';
    
    const response = await fetch(`${baseUrl}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });

    if (!response.ok) {
      let errorMessage = "Erro no servidor ao processar imagem.";
      try {
        // Clonamos para poder ler como texto se JSON falhar
        const clone = response.clone();
        try {
          const errorData = await clone.json();
          console.error("Servidor retornou erro JSON:", errorData);
          errorMessage = errorData.details || errorData.error || errorMessage;
          if (errorData.debug) errorMessage += `\nDebug: ${errorData.debug}`;
        } catch (e) {
          const textError = await response.text();
          console.error("Servidor retornou erro HTML/Texto:", textError);
          errorMessage = `Erro ${response.status}: ${textError.substring(0, 80)}...`;
        }
      } catch (e) {
        errorMessage = `Erro de conexão (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return {
      id: result.id,
      name: result.name || "",
      price: typeof result.price === 'number' ? result.price : 0,
      isWeightBased: result.is_weight_based,
      estimated_weight_g: result.estimated_weight_g,
      rawText: JSON.stringify(result)
    };
  } catch (error: any) {
    console.error("Erro no scanPriceTag:", error);
    throw error;
  }
}
