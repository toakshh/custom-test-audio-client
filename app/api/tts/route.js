// API route for text-to-speech conversion

import { registry } from '@/lib/providers/registry';

export async function POST(request) {
  try {
    const { text, provider = 'elevenlabs', voiceId, options = {} } = await request.json();

    if (!text) {
      return Response.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const ttsProvider = registry.getTTSProvider(provider);
    const result = await ttsProvider.synthesize(text, { voiceId, ...options });

    // Return audio as base64 with metrics
    return Response.json({
      success: true,
      audio: result.audio.toString('base64'),
      contentType: result.contentType,
      provider: result.provider,
      voiceId: result.voiceId,
      metrics: result.metrics,
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
