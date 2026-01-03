// API route to get available providers and their models/voices

import { registry } from '@/lib/providers/registry';

export async function GET() {
  try {
    const llmProviders = registry.getAvailableLLMProviders();
    const ttsProviders = registry.getAvailableTTSProviders();

    return Response.json({
      llm: llmProviders,
      tts: ttsProviders,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
