import { BaseLLMProvider } from '../base';

export class GeminiProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  getAvailableModels() {
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast multimodal model' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
    ];
  }

  async generateResponse(prompt, options = {}) {
    const model = options.model || 'gemini-2.0-flash';
    const startTime = Date.now();

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const endTime = Date.now();

    return {
      text: data.candidates[0].content.parts[0].text,
      model,
      provider: 'gemini',
      metrics: {
        latencyMs: endTime - startTime,
        tokensUsed: data.usageMetadata?.totalTokenCount || 0,
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  async *streamResponse(prompt, options = {}) {
    const model = options.model || 'gemini-2.0-flash';
    const startTime = Date.now();
    let firstTokenTime = null;

    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Gemini API error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              if (!firstTokenTime) firstTokenTime = Date.now();
              yield { type: 'chunk', content };
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    yield {
      type: 'done',
      metrics: {
        totalLatencyMs: Date.now() - startTime,
        timeToFirstTokenMs: firstTokenTime ? firstTokenTime - startTime : null,
      },
    };
  }
}
