import OpenAI from "openai";

function getOpenAIClient(): OpenAI {
  const directKey = process.env.OPENAI_API_KEY_DIRECT;
  const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const proxyUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  const apiKey = directKey || proxyKey;
  const baseURL = directKey ? "https://api.openai.com/v1" : proxyUrl;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY_DIRECT or AI_INTEGRATIONS_OPENAI_API_KEY must be set.",
    );
  }

  if (!baseURL) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set.",
    );
  }

  return new OpenAI({ apiKey, baseURL });
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    return (client as any)[prop];
  },
});
