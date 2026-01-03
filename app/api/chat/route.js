// API route for text-to-text (LLM) responses

import { registry } from '@/lib/providers/registry';

export async function POST(request) {
  try {
    const { prompt, provider = 'openai', model, options = {} } = await request.json();

    if (!prompt) {
      return Response.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const llmProvider = registry.getLLMProvider(provider);
    const result = await llmProvider.generateResponse(prompt, { model, ...options });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
