import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const parseForm16 = async (imageData: string, retries = 3): Promise<any> => {
  const mimeType = imageData.split(';')[0].split(':')[1];
  const base64Data = imageData.split(',')[1];

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Extract financial data from this Form 16 document. Focus on: Gross Salary, Section 80C deductions, Section 80D, Home Loan Interest (Section 24), Education Loan (Section 80E), HRA, and NPS. Return as JSON." },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              grossSalary: { type: Type.NUMBER },
              section80C: { type: Type.NUMBER },
              section80D: { type: Type.NUMBER },
              section24: { type: Type.NUMBER },
              section80E: { type: Type.NUMBER },
              hra: { type: Type.NUMBER },
              nps: { type: Type.NUMBER },
              pan: { type: Type.STRING },
              employerName: { type: Type.STRING }
            }
          }
        }
      });

      return JSON.parse(response.text);
    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        throw error;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

export const getInvestmentAdvice = async (profile: any) => {
  const hraTip = profile.deductions.hra === 0 
    ? "\nPROFESSIONAL TIP: The user hasn't claimed any HRA. If they live in a rented house, explain how HRA calculation could save them significant tax." 
    : "";

  const prompt = `Based on this Indian taxpayer profile:
    Gross Salary: ₹${profile.salary}
    Current Deductions: ${JSON.stringify(profile.deductions)}
    Risk Profile: ${profile.riskProfile}
    ${hraTip}
    
    Suggest 3-5 tax-saving investments (80C, 80D, 80CCD) ranked by risk and liquidity. 
    Explain why each fits their profile. Use Indian context (ELSS, PPF, NPS, Health Insurance).
    Be concise and avoid repetitive explanations.
    
    CRITICAL: Include a "Comparison Summary" section at the end with a Markdown Table containing:
    | Investment | Section | Risk Level | Liquidity | Why for you? |
    Ensure the table is formatted with proper line breaks so it renders correctly.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text;
};
