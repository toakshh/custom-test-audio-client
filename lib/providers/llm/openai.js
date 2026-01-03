import { BaseLLMProvider } from '../base';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  getAvailableModels() {
    return [
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Latest GPT-4.1 model' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'GPT-4o optimized' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Smaller, faster GPT-4o' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
    ];
  }

  async generateResponse(prompt, options = {}) {
    const model = options.model || 'gpt-4o-mini';
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const endTime = Date.now();

    return {
      text: data.choices[0].message.content,
      model,
      provider: 'openai',
      metrics: {
        latencyMs: endTime - startTime,
        tokensUsed: data.usage?.total_tokens || 0,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async *streamResponse(prompt, options = {}) {
    const model = options.model || 'gpt-4o-mini';
    const startTime = Date.now();
    let firstTokenTime = null;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
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
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield {
              type: 'done',
              metrics: {
                totalLatencyMs: Date.now() - startTime,
                timeToFirstTokenMs: firstTokenTime ? firstTokenTime - startTime : null,
              },
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
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
  }
}
