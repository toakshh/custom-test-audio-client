import { BaseTTSProvider } from '../base';

export class ElevenLabsProvider extends BaseTTSProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  getAvailableVoices() {
    return [
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft, warm female voice' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, professional female' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Strong, confident female' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Well-rounded male voice' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Crisp, authoritative male' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Deep, narrative male' },
      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'Raspy, dynamic male' },
    ];
  }

  async synthesize(text, options = {}) {
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const modelId = options.modelId || 'eleven_multilingual_v2';
    const startTime = Date.now();

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarityBoost || 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.message || 'ElevenLabs API error');
    }

    const audioBuffer = await response.arrayBuffer();
    const endTime = Date.now();

    return {
      audio: Buffer.from(audioBuffer),
      contentType: 'audio/mpeg',
      provider: 'elevenlabs',
      voiceId,
      metrics: {
        latencyMs: endTime - startTime,
        textLength: text.length,
        audioSizeBytes: audioBuffer.byteLength,
      },
    };
  }

  async *streamSynthesize(text, options = {}) {
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const modelId = options.modelId || 'eleven_multilingual_v2';
    const startTime = Date.now();
    let firstChunkTime = null;

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarityBoost || 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.message || 'ElevenLabs streaming error');
    }

    const reader = response.body.getReader();
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstChunkTime) firstChunkTime = Date.now();
      totalBytes += value.length;

      yield {
        type: 'chunk',
        audio: Buffer.from(value),
        contentType: 'audio/mpeg',
      };
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
