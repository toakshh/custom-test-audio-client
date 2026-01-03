// API route to fetch voices dynamically from TTS providers

import { registry } from '@/lib/providers/registry';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return Response.json(
        { error: 'Provider parameter is required' },
        { status: 400 }
      );
    }

    const ttsProvider = registry.getTTSProvider(provider);

    // Check if provider has async fetchVoices method
    if (typeof ttsProvider.fetchVoices === 'function') {
      const voices = await ttsProvider.fetchVoices();
      return Response.json({ voices, provider });
    }

    // Fall back to synchronous getAvailableVoices
    const voices = ttsProvider.getAvailableVoices();
    return Response.json({ voices, provider });
  } catch (error) {
    console.error('Voices API error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
