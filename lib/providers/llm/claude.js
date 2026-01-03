import { BaseLLMProvider } from '../base';

export class ClaudeProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  getAvailableModels() {
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest Claude Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Balanced performance' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast and efficient' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' },
    ];
  }

  async generateResponse(prompt, options = {}) {
    const model = options.model || 'claude-3-5-sonnet-20241022';
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Claude API error');
    }

    const data = await response.json();
    const endTime = Date.now();

    return {
      text: data.content[0].text,
      model,
      provider: 'claude',
      metrics: {
        latencyMs: endTime - startTime,
        tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
      },
    };
  }

  async *streamResponse(prompt, options = {}) {
    const model = options.model || 'claude-3-5-sonnet-20241022';
    const startTime = Date.now();
    let firstTokenTime = null;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Claude API error');
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
            if (data.type === 'content_block_delta') {
              const content = data.delta?.text;
              if (content) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                yield { type: 'chunk', content };
              }
            } else if (data.type === 'message_stop') {
              yield {
                type: 'done',
                metrics: {
                  totalLatencyMs: Date.now() - startTime,
                  timeToFirstTokenMs: firstTokenTime ? firstTokenTime - startTime : null,
                },
              };
              return;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}
