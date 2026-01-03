# AI Voice Assistant

Multi-provider LLM + TTS system with real-time streaming and comprehensive metrics.

## Features

- **Multiple LLM Providers**: OpenAI, Google Gemini, Anthropic Claude
- **Multiple TTS Providers**: ElevenLabs, Inworld AI (extensible)
- **Real-time Streaming**: Parallel text generation and speech synthesis
- **Comprehensive Metrics**: Latency tracking, token usage, comparison charts
- **Auto-play Audio**: Automatic playback with queue management
- **Model Selection**: Switch between models/voices on the fly

## Architecture

```
Frontend (Next.js App Router)
├── Query Input + Provider Selectors
├── Response Display + Audio Player
└── Metrics Dashboard (last 20 requests)

Backend (API Routes)
├── /api/chat - Standard LLM requests
├── /api/tts - Text-to-speech conversion
├── /api/stream - Real-time streaming with parallel TTS
└── /api/providers - Available providers/models/voices

Provider Registry (Extensible)
├── LLM: OpenAI, Gemini, Claude
└── TTS: ElevenLabs, Inworld
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` from `.env.example`:
```bash
cp .env.example .env.local
```

3. Add your API keys to `.env.local`:
```env
OPENAI_API_KEY=sk-your-key
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=sk-ant-your-key
ELEVENLABS_API_KEY=your-key
INWORLD_API_KEY=your-key
```

4. Run the development server:
```bash
npm run dev
```

## Adding New Providers

### New LLM Provider

1. Create `lib/providers/llm/your-provider.js`:
```javascript
import { BaseLLMProvider } from '../base';

export class YourProvider extends BaseLLMProvider {
  getAvailableModels() { /* return models */ }
  async generateResponse(prompt, options) { /* implement */ }
  async *streamResponse(prompt, options) { /* implement */ }
}
```

2. Register in `lib/providers/registry.js`:
```javascript
import { YourProvider } from './llm/your-provider';
this.registerLLMProvider('yourprovider', YourProvider);
```

### New TTS Provider

1. Create `lib/providers/tts/your-provider.js`:
```javascript
import { BaseTTSProvider } from '../base';

export class YourTTSProvider extends BaseTTSProvider {
  getAvailableVoices() { /* return voices */ }
  async synthesize(text, options) { /* implement */ }
  async *streamSynthesize(text, options) { /* implement */ }
}
```

2. Register in `lib/providers/registry.js`:
```javascript
import { YourTTSProvider } from './tts/your-provider';
this.registerTTSProvider('yourprovider', YourTTSProvider);
```

## API Reference

### POST /api/chat
Standard LLM request.
```json
{
  "prompt": "Your question",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

### POST /api/tts
Text-to-speech conversion.
```json
{
  "text": "Text to speak",
  "provider": "elevenlabs",
  "voiceId": "EXAVITQu4vr4xnSDxMaL"
}
```

### POST /api/stream
Real-time streaming with parallel TTS.
```json
{
  "prompt": "Your question",
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini",
  "ttsProvider": "elevenlabs",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "enableTTS": true
}
```

### GET /api/providers
Get available providers, models, and voices.
