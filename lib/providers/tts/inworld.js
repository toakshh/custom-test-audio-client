import { BaseTTSProvider } from '../base';

export class InworldProvider extends BaseTTSProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.INWORLD_API_KEY;
    this.baseUrl = config.baseUrl || process.env.INWORLD_BASE_URL || 'https://api.inworld.ai';
    this.cachedVoices = null;
  }

  // Fetch voices dynamically from Inworld API
  async fetchVoices() {
    try {
      const response = await fetch(`${this.baseUrl}/tts/v1/voices`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch Inworld voices:', response.status);
        return this.getDefaultVoices();
      }

      const data = await response.json();
      return data.voices.map(voice => ({
        id: voice.voiceId,
        name: voice.displayName,
        description: voice.description,
        languages: voice.languages,
        tags: voice.tags,
      }));
    } catch (error) {
      console.error('Error fetching Inworld voices:', error);
      return this.getDefaultVoices();
    }
  }

  getDefaultVoices() {
    return [
      { id: 'Alex', name: 'Alex', description: 'Energetic and expressive mid-range male voice' },
      { id: 'Ashley', name: 'Ashley', description: 'A warm, natural female voice' },
      { id: 'Dennis', name: 'Dennis', description: 'Middle-aged man with a smooth, calm and friendly voice' },
    ];
  }

  getAvailableVoices() {
    // Return default voices synchronously for registry compatibility
    return this.getDefaultVoices();
  }

  async synthesize(text, options = {}) {
    const voiceId = options.voiceId || 'Dennis';
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/tts/v1/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.apiKey}`,
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: options.modelId || 'inworld-tts-1',
        timestampType: 'WORD',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Inworld API error: ${response.status}`);
    }

    const res = await response.json();
    const endTime = Date.now();

    // audioContent is base64-encoded WAV, decode it to a Buffer
    const audioBuffer = Buffer.from(res.audioContent, 'base64');

    return {
      audio: audioBuffer,
      contentType: 'audio/wav',
      provider: 'inworld',
      voiceId,
      timestampInfo: res.timestampInfo,
      metrics: {
        latencyMs: endTime - startTime,
        textLength: text.length,
        audioSizeBytes: audioBuffer.length,
      },
    };
  }

  async *streamSynthesize(text, options = {}) {
    const voiceId = options.voiceId || 'Dennis';
    const startTime = Date.now();
    let firstChunkTime = null;

    const response = await fetch(`${this.baseUrl}/tts/v1/voice:stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.apiKey}`,
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: options.modelId || 'inworld-tts-1',
        timestampType: 'WORD',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Inworld streaming error: ${response.status}`);
    }

    const reader = response.body.getReader();
    let totalBytes = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstChunkTime) firstChunkTime = Date.now();

      // Inworld stream returns JSON chunks with result objects
      const chunk = new TextDecoder().decode(value);
      buffer += chunk;

      // Try to parse complete JSON objects from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line);
          if (data.result?.audioContent) {
            const audioBuffer = Buffer.from(data.result.audioContent, 'base64');
            totalBytes += audioBuffer.length;

            yield {
              type: 'chunk',
              audio: audioBuffer,
              contentType: 'audio/wav',
              timestampInfo: data.result.timestampInfo,
            };
          }
        } catch (parseError) {
          // May be partial JSON, continue accumulating
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.result?.audioContent) {
          const audioBuffer = Buffer.from(data.result.audioContent, 'base64');
          totalBytes += audioBuffer.length;

          yield {
            type: 'chunk',
            audio: audioBuffer,
            contentType: 'audio/wav',
            timestampInfo: data.result.timestampInfo,
          };
        }
      } catch (parseError) {
        // Ignore incomplete data
      }
    }

    yield {
      type: 'done',
      metrics: {
        totalLatencyMs: Date.now() - startTime,
        timeToFirstChunkMs: firstChunkTime ? firstChunkTime - startTime : null,
        audioSizeBytes: totalBytes,
      },
    };
  }
}
