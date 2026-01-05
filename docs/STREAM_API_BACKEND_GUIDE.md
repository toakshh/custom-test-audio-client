# Stream API Backend - Developer Guide

This guide explains how to rebuild the `/api/stream` backend from scratch. The API combines LLM text streaming with parallel TTS audio synthesis using Server-Sent Events (SSE).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         /api/stream                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   POST Request (application/json)                                │
│         │                                                        │
│         ▼                                                        │
│   ┌───────────────┐                                              │
│   │ Parse Request │ prompt, llmProvider, ttsProvider, etc.       │
│   └───────┬───────┘                                              │
│           │                                                      │
│           ▼                                                      │
│   ┌───────────────┐      ┌─────────────────┐                     │
│   │   Registry    │─────▶│  LLM Provider   │                     │
│   │               │      │ (OpenAI/Gemini) │                     │
│   │               │      └────────┬────────┘                     │
│   │               │               │                              │
│   │               │               ▼                              │
│   │               │      ┌─────────────────┐                     │
│   │               │      │  Text Chunks    │──▶ SSE: type="text" │
│   │               │      │  (streaming)    │                     │
│   │               │      └────────┬────────┘                     │
│   │               │               │                              │
│   │               │               ▼ (buffer ~100 chars)          │
│   │               │      ┌─────────────────┐                     │
│   │               │─────▶│  TTS Provider   │                     │
│   │               │      │ (ElevenLabs/    │                     │
│   └───────────────┘      │  Inworld)       │                     │
│                          └────────┬────────┘                     │
│                                   │                              │
│                                   ▼                              │
│                          ┌─────────────────┐                     │
│                          │  Audio Chunks   │──▶ SSE: type="audio"│
│                          │  (parallel)     │                     │
│                          └─────────────────┘                     │
│                                                                  │
│   Response: text/event-stream (SSE)                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
├── app/
│   └── api/
│       └── stream/
│           └── route.js          # Main stream endpoint
├── lib/
│   └── providers/
│       ├── base.js               # Base provider classes
│       ├── registry.js           # Provider registry (singleton)
│       ├── llm/
│       │   ├── openai.js         # OpenAI provider
│       │   ├── gemini.js         # Gemini provider
│       │   └── claude.js         # Claude provider
│       └── tts/
│           ├── elevenlabs.js     # ElevenLabs provider
│           └── inworld.js        # Inworld provider
└── .env                          # API keys
```

---

## Step 1: Base Provider Classes

Create `lib/providers/base.js`:

```javascript
// Abstract base classes that all providers must implement

export class BaseLLMProvider {
  constructor(config = {}) {
    this.config = config;
  }

  // Non-streaming response
  async generateResponse(prompt, options = {}) {
    throw new Error('generateResponse must be implemented');
  }

  // Streaming response (async generator)
  async *streamResponse(prompt, options = {}) {
    throw new Error('streamResponse must be implemented');
  }

  // Return available models
  getAvailableModels() {
    throw new Error('getAvailableModels must be implemented');
  }
}

export class BaseTTSProvider {
  constructor(config = {}) {
    this.config = config;
  }

  // Non-streaming synthesis
  async synthesize(text, options = {}) {
    throw new Error('synthesize must be implemented');
  }

  // Streaming synthesis (async generator)
  async *streamSynthesize(text, options = {}) {
    throw new Error('streamSynthesize must be implemented');
  }

  // Return available voices
  getAvailableVoices() {
    throw new Error('getAvailableVoices must be implemented');
  }
}
```

---

## Step 2: LLM Provider Implementation

Create `lib/providers/llm/openai.js`:

```javascript
import { BaseLLMProvider } from '../base';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  getAvailableModels() {
    return [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and efficient' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
    ];
  }

  // Streaming response - yields chunks as they arrive
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
        stream: true,  // Enable streaming
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
            // Stream complete - yield final metrics
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
```

---

## Step 3: TTS Provider Implementation

Create `lib/providers/tts/elevenlabs.js`:

```javascript
import { BaseTTSProvider } from '../base';

export class ElevenLabsProvider extends BaseTTSProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  getAvailableVoices() {
    return [
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Warm female' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Professional female' },
    ];
  }

  // Non-streaming synthesis - returns complete audio
  async synthesize(text, options = {}) {
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
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
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.message || 'ElevenLabs API error');
    }

    const audioBuffer = await response.arrayBuffer();

    return {
      audio: Buffer.from(audioBuffer),
      contentType: 'audio/mpeg',
      metrics: {
        latencyMs: Date.now() - startTime,
        textLength: text.length,
        audioSizeBytes: audioBuffer.byteLength,
      },
    };
  }

  // Streaming synthesis - yields audio chunks
  async *streamSynthesize(text, options = {}) {
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';

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
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error('ElevenLabs streaming error');
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      yield {
        type: 'chunk',
        audio: Buffer.from(value),
        contentType: 'audio/mpeg',
      };
    }
  }
}
```

---

## Step 4: Provider Registry

Create `lib/providers/registry.js`:

```javascript
import { OpenAIProvider } from './llm/openai';
import { GeminiProvider } from './llm/gemini';
import { ElevenLabsProvider } from './tts/elevenlabs';
import { InworldProvider } from './tts/inworld';

class ProviderRegistry {
  constructor() {
    this.llmProviders = new Map();
    this.ttsProviders = new Map();
    this.initializeDefaultProviders();
  }

  initializeDefaultProviders() {
    // Register LLM providers
    this.registerLLMProvider('openai', OpenAIProvider);
    this.registerLLMProvider('gemini', GeminiProvider);

    // Register TTS providers
    this.registerTTSProvider('elevenlabs', ElevenLabsProvider);
    this.registerTTSProvider('inworld', InworldProvider);
  }

  registerLLMProvider(name, ProviderClass) {
    this.llmProviders.set(name, ProviderClass);
  }

  registerTTSProvider(name, ProviderClass) {
    this.ttsProviders.set(name, ProviderClass);
  }

  getLLMProvider(name, config = {}) {
    const ProviderClass = this.llmProviders.get(name);
    if (!ProviderClass) {
      throw new Error(`LLM provider '${name}' not found`);
    }
    return new ProviderClass(config);
  }

  getTTSProvider(name, config = {}) {
    const ProviderClass = this.ttsProviders.get(name);
    if (!ProviderClass) {
      throw new Error(`TTS provider '${name}' not found`);
    }
    return new ProviderClass(config);
  }
}

// Singleton instance
export const registry = new ProviderRegistry();
```

---

## Step 5: Stream API Route

Create `app/api/stream/route.js`:

```javascript
import { registry } from '@/lib/providers/registry';

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  try {
    // 1. Parse request body
    const { 
      prompt, 
      llmProvider = 'openai', 
      llmModel,
      ttsProvider = 'elevenlabs',
      voiceId,
      enableTTS = true,
      streamTTS = false,
      options = {} 
    } = await request.json();

    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 2. Get provider instances from registry
    const llm = registry.getLLMProvider(llmProvider);
    const tts = enableTTS ? registry.getTTSProvider(ttsProvider) : null;

    // 3. Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const startTime = Date.now();
        let fullText = '';
        let textBuffer = '';
        let llmMetrics = null;
        const CHUNK_SIZE = 100;  // Buffer size before TTS
        let playSequence = 0;
        const ttsPromises = [];

        // TTS timing
        let firstTtsStartTime = null;
        let firstTtsChunkTime = null;

        // Helper: Start TTS for a text chunk
        const startTTS = (text, sequence) => {
          const ttsStartTime = Date.now();
          if (firstTtsStartTime === null) firstTtsStartTime = ttsStartTime;
          
          const promise = (async () => {
            try {
              if (streamTTS && typeof tts.streamSynthesize === 'function') {
                // Streaming TTS
                for await (const chunk of tts.streamSynthesize(text, { voiceId })) {
                  if (chunk.type === 'chunk') {
                    if (firstTtsChunkTime === null) firstTtsChunkTime = Date.now();
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ 
                        type: 'audio', 
                        audio: chunk.audio.toString('base64'),
                        contentType: chunk.contentType,
                        playSequence: sequence,
                        streaming: true,
                      })}\n\n`
                    ));
                  }
                }
              } else {
                // Non-streaming TTS
                const audioResult = await tts.synthesize(text, { voiceId });
                if (firstTtsChunkTime === null) firstTtsChunkTime = Date.now();
                
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ 
                    type: 'audio', 
                    audio: audioResult.audio.toString('base64'),
                    contentType: audioResult.contentType,
                    playSequence: sequence,
                    metrics: audioResult.metrics,
                  })}\n\n`
                ));
              }

              // Signal sequence complete
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'audio_complete', playSequence: sequence })}\n\n`
              ));
            } catch (ttsError) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tts_error', playSequence: sequence, error: ttsError.message })}\n\n`
              ));
            }
          })();
          ttsPromises.push(promise);
        };

        try {
          // 4. Stream LLM response
          for await (const chunk of llm.streamResponse(prompt, { model: llmModel, ...options })) {
            if (chunk.type === 'chunk') {
              fullText += chunk.content;
              textBuffer += chunk.content;

              // Send text chunk to client
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`
              ));

              // Start TTS when buffer is large enough
              if (enableTTS && tts && textBuffer.length >= CHUNK_SIZE) {
                const breakPoint = findBreakPoint(textBuffer);
                if (breakPoint > 0) {
                  const textToSpeak = textBuffer.substring(0, breakPoint);
                  textBuffer = textBuffer.substring(breakPoint);
                  startTTS(textToSpeak, playSequence++);
                }
              }
            } else if (chunk.type === 'done') {
              llmMetrics = chunk.metrics;
            }
          }

          // 5. Process remaining text buffer
          if (enableTTS && tts && textBuffer.trim().length > 0) {
            startTTS(textBuffer, playSequence++);
          }

          // Send total sequence count
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'tts_total', totalSequences: playSequence })}\n\n`
          ));

          // 6. Wait for all TTS to complete
          await Promise.all(ttsPromises);

          // Calculate TTS latency
          const ttsLatencyMs = (firstTtsStartTime && firstTtsChunkTime) 
            ? firstTtsChunkTime - firstTtsStartTime 
            : null;

          // 7. Send completion event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'done',
              fullText,
              llmMetrics,
              ttsMetrics: ttsLatencyMs ? { latencyMs: ttsLatencyMs } : null,
              totalTime: Date.now() - startTime
            })}\n\n`
          ));

        } catch (error) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
          ));
        }

        controller.close();
      },
    });

    // 8. Return SSE response
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Find natural break point in text
function findBreakPoint(text) {
  // Prefer sentence breaks
  const sentenceBreaks = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  for (const br of sentenceBreaks) {
    const idx = text.lastIndexOf(br);
    if (idx > 0) return idx + br.length;
  }
  
  // Fall back to clause breaks
  const clauseBreaks = [', ', '; ', ': '];
  for (const br of clauseBreaks) {
    const idx = text.lastIndexOf(br);
    if (idx > 0) return idx + br.length;
  }
  
  // Last resort: word break
  const spaceIdx = text.lastIndexOf(' ');
  if (spaceIdx > 0) return spaceIdx + 1;
  
  return 0;
}
```

---

## Step 6: Environment Variables

Create `.env`:

```env
# LLM Providers (at least one required)
OPENAI_API_KEY=sk-your-key
GEMINI_API_KEY=your-key

# TTS Providers (at least one required)
ELEVENLABS_API_KEY=your-key
INWORLD_API_KEY=your-key
INWORLD_BASE_URL=https://api.inworld.ai
```

---

## API Reference

### Request

```
POST /api/stream
Content-Type: application/json
```

```json
{
  "prompt": "string (required)",
  "llmProvider": "openai | gemini | claude",
  "llmModel": "gpt-4o-mini | gemini-2.0-flash | etc",
  "ttsProvider": "elevenlabs | inworld",
  "voiceId": "voice-id-string",
  "enableTTS": true,
  "streamTTS": false,
  "options": {
    "maxTokens": 1000,
    "temperature": 0.7
  }
}
```

### Response

```
Content-Type: text/event-stream
```

**SSE Events:**

| Event Type | Description |
|------------|-------------|
| `text` | LLM text chunk: `{ type: "text", content: "..." }` |
| `audio` | TTS audio (base64): `{ type: "audio", audio: "...", contentType: "audio/mpeg", playSequence: 0 }` |
| `audio_complete` | Sequence done: `{ type: "audio_complete", playSequence: 0 }` |
| `tts_total` | Total sequences: `{ type: "tts_total", totalSequences: 3 }` |
| `done` | Stream complete: `{ type: "done", fullText: "...", llmMetrics: {...}, ttsMetrics: {...}, totalTime: 1234 }` |
| `error` | Error: `{ type: "error", error: "message" }` |
| `tts_error` | TTS error: `{ type: "tts_error", playSequence: 1, error: "message" }` |

---

## Key Concepts

### 1. Parallel Processing
LLM streaming and TTS synthesis run in parallel. As text chunks arrive from the LLM, TTS requests are fired off immediately without waiting.

### 2. Text Buffering
Text is buffered until ~100 characters accumulate, then split at natural break points (sentences, clauses) before sending to TTS. This balances latency vs. natural speech.

### 3. Sequence Numbers
Each TTS chunk gets a `playSequence` number (0, 1, 2...) so the client can play audio in correct order even if chunks arrive out of order.

### 4. Provider Abstraction
The registry pattern allows swapping providers without changing the stream logic. Just implement the base class interface.

---

## Adding a New Provider

### New LLM Provider

```javascript
// lib/providers/llm/newprovider.js
import { BaseLLMProvider } from '../base';

export class NewProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = process.env.NEW_PROVIDER_API_KEY;
  }

  getAvailableModels() {
    return [{ id: 'model-1', name: 'Model 1', description: '...' }];
  }

  async *streamResponse(prompt, options = {}) {
    // Implement streaming logic
    // yield { type: 'chunk', content: '...' }
    // yield { type: 'done', metrics: {...} }
  }
}

// Register in registry.js
this.registerLLMProvider('newprovider', NewProvider);
```

### New TTS Provider

```javascript
// lib/providers/tts/newprovider.js
import { BaseTTSProvider } from '../base';

export class NewTTSProvider extends BaseTTSProvider {
  getAvailableVoices() {
    return [{ id: 'voice-1', name: 'Voice 1', description: '...' }];
  }

  async synthesize(text, options = {}) {
    // Return { audio: Buffer, contentType: 'audio/mpeg', metrics: {...} }
  }

  async *streamSynthesize(text, options = {}) {
    // yield { type: 'chunk', audio: Buffer, contentType: '...' }
  }
}

// Register in registry.js
this.registerTTSProvider('newprovider', NewTTSProvider);
```

---

## Testing

```bash
# Basic test
curl -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Say hello", "enableTTS": false}'

# With TTS
curl -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Tell me a joke", "llmProvider": "openai", "ttsProvider": "elevenlabs"}'
```
