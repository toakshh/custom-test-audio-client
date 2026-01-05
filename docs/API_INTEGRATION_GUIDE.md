# LLM + TTS Streaming API Integration Guide

This document provides complete documentation for integrating the backend streaming APIs into external applications. The APIs support real-time LLM text generation with parallel TTS audio synthesis.

## Table of Contents

1. [Base URL Configuration](#base-url-configuration)
2. [API Endpoints Overview](#api-endpoints-overview)
3. [Combined Stream API (Recommended)](#combined-stream-api)
4. [Chat API (LLM Only)](#chat-api)
5. [TTS API (Audio Only)](#tts-api)
6. [Providers API](#providers-api)
7. [SSE Event Types Reference](#sse-event-types-reference)
8. [Client Implementation Examples](#client-implementation-examples)
9. [Error Handling](#error-handling)
10. [Available Providers](#available-providers)

---

## Base URL Configuration

Configure your backend URL in your client application:

```javascript
const BACKEND_URL = 'http://localhost:3000'; // Development
// const BACKEND_URL = 'https://your-production-domain.com'; // Production
```

---

## API Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stream` | POST | Combined LLM + TTS streaming (SSE) |
| `/api/chat` | POST | LLM text generation only |
| `/api/tts` | POST | TTS audio synthesis only |
| `/api/providers` | GET | List available providers and models |

---

## Combined Stream API

**Endpoint:** `POST /api/stream`

The primary endpoint for real-time LLM text streaming with parallel TTS audio generation. Uses Server-Sent Events (SSE) for streaming responses.

### Request

```javascript
// Request Headers
{
  "Content-Type": "application/json"
}

// Request Body
{
  "prompt": "string (required)",        // The input prompt for LLM
  "llmProvider": "string",              // Default: "openai"
  "llmModel": "string",                 // Provider-specific model ID
  "ttsProvider": "string",              // Default: "elevenlabs"
  "voiceId": "string",                  // Provider-specific voice ID
  "enableTTS": "boolean",               // Default: true
  "streamTTS": "boolean",               // Default: false (use streaming TTS)
  "options": {                          // Optional LLM parameters
    "maxTokens": "number",              // Default: 1000
    "temperature": "number"             // Default: 0.7
  }
}
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | The text prompt to send to the LLM |
| `llmProvider` | string | No | `"openai"` | LLM provider: `openai`, `gemini`, `claude` |
| `llmModel` | string | No | Provider default | Model ID (e.g., `gpt-4o-mini`, `gemini-2.0-flash`) |
| `ttsProvider` | string | No | `"elevenlabs"` | TTS provider: `elevenlabs`, `inworld` |
| `voiceId` | string | No | Provider default | Voice ID for TTS synthesis |
| `enableTTS` | boolean | No | `true` | Enable/disable TTS audio generation |
| `streamTTS` | boolean | No | `false` | Use streaming TTS (lower latency) |
| `options.maxTokens` | number | No | `1000` | Maximum tokens in LLM response |
| `options.temperature` | number | No | `0.7` | LLM creativity (0.0-1.0) |

### Response Format (SSE Stream)

The response is a Server-Sent Events stream with multiple event types:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

---

## SSE Event Types Reference

### 1. Text Chunk Event

Emitted as LLM generates text tokens.

```json
{
  "type": "text",
  "content": "string"  // Partial text content
}
```

### 2. Audio Event

Emitted when TTS audio is ready for a text segment.

```json
{
  "type": "audio",
  "audio": "string",           // Base64-encoded audio data
  "contentType": "string",     // "audio/mpeg" (ElevenLabs) or "audio/wav" (Inworld)
  "playSequence": "number",    // Order for sequential playback (0, 1, 2...)
  "streaming": "boolean",      // true if from streaming TTS
  "metrics": {                 // Only for non-streaming TTS
    "latencyMs": "number",
    "textLength": "number",
    "audioSizeBytes": "number"
  },
  "timestampInfo": "object"    // Word-level timestamps (Inworld only)
}
```

### 3. Audio Complete Event

Signals a specific audio sequence has finished sending all chunks.

```json
{
  "type": "audio_complete",
  "playSequence": "number"     // Which sequence completed
}
```

### 4. TTS Total Event

Indicates total number of audio sequences to expect.

```json
{
  "type": "tts_total",
  "totalSequences": "number"   // Total audio segments
}
```

### 5. Done Event

Final event with complete response and metrics.

```json
{
  "type": "done",
  "fullText": "string",        // Complete LLM response text
  "llmMetrics": {
    "totalLatencyMs": "number",
    "timeToFirstTokenMs": "number"
  },
  "ttsMetrics": {
    "latencyMs": "number"      // Time to first audio chunk
  },
  "totalTime": "number"        // Total request duration (ms)
}
```

### 6. Error Event

Emitted on stream errors.

```json
{
  "type": "error",
  "error": "string"            // Error message
}
```

### 7. TTS Error Event

Emitted on TTS-specific errors.

```json
{
  "type": "tts_error",
  "playSequence": "number",
  "error": "string"
}
```

---

## Chat API

**Endpoint:** `POST /api/chat`

Non-streaming LLM text generation.

### Request

```javascript
{
  "prompt": "string (required)",
  "provider": "string",         // Default: "openai"
  "model": "string",            // Provider-specific model
  "options": {
    "maxTokens": "number",
    "temperature": "number"
  }
}
```

### Response

```json
{
  "success": true,
  "text": "string",             // Generated text
  "model": "string",
  "provider": "string",
  "metrics": {
    "latencyMs": "number",
    "tokensUsed": "number",
    "promptTokens": "number",
    "completionTokens": "number"
  }
}
```

---

## TTS API

**Endpoint:** `POST /api/tts`

Non-streaming text-to-speech synthesis.

### Request

```javascript
{
  "text": "string (required)",
  "provider": "string",         // Default: "elevenlabs"
  "voiceId": "string",
  "options": {
    "stability": "number",      // ElevenLabs: 0.0-1.0
    "similarityBoost": "number" // ElevenLabs: 0.0-1.0
  }
}
```

### Response

```json
{
  "success": true,
  "audio": "string",            // Base64-encoded audio
  "contentType": "string",      // "audio/mpeg" or "audio/wav"
  "provider": "string",
  "voiceId": "string",
  "metrics": {
    "latencyMs": "number",
    "textLength": "number",
    "audioSizeBytes": "number"
  }
}
```

---

## Providers API

**Endpoint:** `GET /api/providers`

Get available providers, models, and voices.

### Response

```json
{
  "llm": [
    {
      "id": "openai",
      "name": "Openai",
      "models": [
        { "id": "gpt-4.1", "name": "GPT-4.1", "description": "Latest GPT-4.1 model" },
        { "id": "gpt-4o", "name": "GPT-4o", "description": "GPT-4o optimized" },
        { "id": "gpt-4o-mini", "name": "GPT-4o Mini", "description": "Smaller, faster GPT-4o" }
      ]
    },
    {
      "id": "gemini",
      "name": "Gemini",
      "models": [
        { "id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Fast multimodal model" },
        { "id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "description": "Advanced reasoning" }
      ]
    }
  ],
  "tts": [
    {
      "id": "elevenlabs",
      "name": "Elevenlabs",
      "voices": [
        { "id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "description": "Soft, warm female voice" },
        { "id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "description": "Calm, professional female" }
      ]
    },
    {
      "id": "inworld",
      "name": "Inworld",
      "voices": [
        { "id": "Alex", "name": "Alex", "description": "Energetic mid-range male voice" },
        { "id": "Dennis", "name": "Dennis", "description": "Smooth, calm and friendly voice" }
      ]
    }
  ]
}
```

---

## Client Implementation Examples

### JavaScript/TypeScript - Stream API Client

```javascript
/**
 * LLM + TTS Streaming Client
 * Handles SSE stream parsing and audio playback coordination
 */
class StreamingClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.audioQueue = new Map();  // playSequence -> audio chunks
    this.completedSequences = new Set();
    this.totalSequences = null;
    this.currentPlaySequence = 0;
    this.audioContext = null;
    this.isPlaying = false;
  }

  /**
   * Start a streaming request with LLM + TTS
   * @param {Object} params - Request parameters
   * @param {Function} onText - Callback for text chunks
   * @param {Function} onAudio - Callback for audio data
   * @param {Function} onDone - Callback when complete
   * @param {Function} onError - Callback for errors
   */
  async stream(params, { onText, onAudio, onDone, onError }) {
    try {
      const response = await fetch(`${this.baseUrl}/api/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.prompt,
          llmProvider: params.llmProvider || 'openai',
          llmModel: params.llmModel,
          ttsProvider: params.ttsProvider || 'elevenlabs',
          voiceId: params.voiceId,
          enableTTS: params.enableTTS ?? true,
          streamTTS: params.streamTTS ?? false,
          options: params.options || {}
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Stream request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            this.handleEvent(data, { onText, onAudio, onDone, onError });
          }
        }
      }
    } catch (error) {
      onError?.(error);
    }
  }

  handleEvent(data, callbacks) {
    switch (data.type) {
      case 'text':
        callbacks.onText?.(data.content);
        break;

      case 'audio':
        this.queueAudio(data);
        callbacks.onAudio?.(data);
        break;

      case 'audio_complete':
        this.completedSequences.add(data.playSequence);
        this.tryPlayNext();
        break;

      case 'tts_total':
        this.totalSequences = data.totalSequences;
        break;

      case 'done':
        callbacks.onDone?.(data);
        break;

      case 'error':
      case 'tts_error':
        callbacks.onError?.(new Error(data.error));
        break;
    }
  }

  queueAudio(data) {
    const sequence = data.playSequence;
    if (!this.audioQueue.has(sequence)) {
      this.audioQueue.set(sequence, []);
    }
    this.audioQueue.get(sequence).push({
      audio: data.audio,
      contentType: data.contentType
    });
  }

  async tryPlayNext() {
    if (this.isPlaying) return;
    if (!this.completedSequences.has(this.currentPlaySequence)) return;

    const chunks = this.audioQueue.get(this.currentPlaySequence);
    if (!chunks || chunks.length === 0) return;

    this.isPlaying = true;
    await this.playAudioChunks(chunks);
    this.isPlaying = false;

    this.audioQueue.delete(this.currentPlaySequence);
    this.currentPlaySequence++;
    this.tryPlayNext();
  }

  async playAudioChunks(chunks) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    for (const chunk of chunks) {
      const audioData = Uint8Array.from(atob(chunk.audio), c => c.charCodeAt(0));
      const audioBuffer = await this.audioContext.decodeAudioData(audioData.buffer);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      await new Promise(resolve => {
        source.onended = resolve;
        source.start();
      });
    }
  }

  reset() {
    this.audioQueue.clear();
    this.completedSequences.clear();
    this.totalSequences = null;
    this.currentPlaySequence = 0;
    this.isPlaying = false;
  }
}

// Usage Example
const client = new StreamingClient('http://localhost:3000');

let fullText = '';

await client.stream(
  {
    prompt: 'Explain quantum computing in simple terms',
    llmProvider: 'openai',
    llmModel: 'gpt-4o-mini',
    ttsProvider: 'elevenlabs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    enableTTS: true,
    streamTTS: false
  },
  {
    onText: (text) => {
      fullText += text;
      console.log('Text chunk:', text);
    },
    onAudio: (audioData) => {
      console.log('Audio received, sequence:', audioData.playSequence);
    },
    onDone: (result) => {
      console.log('Complete!', {
        fullText: result.fullText,
        llmLatency: result.llmMetrics?.totalLatencyMs,
        ttsLatency: result.ttsMetrics?.latencyMs,
        totalTime: result.totalTime
      });
    },
    onError: (error) => {
      console.error('Error:', error.message);
    }
  }
);
```

### React Hook Implementation

```javascript
import { useState, useCallback, useRef } from 'react';

/**
 * React hook for LLM + TTS streaming
 */
export function useStreamingLLM(baseUrl) {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef(new Map());
  const completedRef = useRef(new Set());
  const currentSeqRef = useRef(0);
  const isPlayingRef = useRef(false);
  const abortControllerRef = useRef(null);

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current) return;
    if (!completedRef.current.has(currentSeqRef.current)) return;

    const chunks = audioQueueRef.current.get(currentSeqRef.current);
    if (!chunks?.length) return;

    isPlayingRef.current = true;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    for (const chunk of chunks) {
      try {
        const audioData = Uint8Array.from(atob(chunk.audio), c => c.charCodeAt(0));
        const audioBuffer = await audioContextRef.current.decodeAudioData(
          audioData.buffer.slice(0)
        );
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        
        await new Promise(resolve => {
          source.onended = resolve;
          source.start();
        });
      } catch (e) {
        console.error('Audio playback error:', e);
      }
    }

    audioQueueRef.current.delete(currentSeqRef.current);
    currentSeqRef.current++;
    isPlayingRef.current = false;
    playNextAudio();
  }, []);

  const stream = useCallback(async (params) => {
    // Reset state
    setText('');
    setError(null);
    setMetrics(null);
    setIsStreaming(true);
    audioQueueRef.current.clear();
    completedRef.current.clear();
    currentSeqRef.current = 0;
    isPlayingRef.current = false;

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${baseUrl}/api/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = JSON.parse(line.slice(6));

          switch (data.type) {
            case 'text':
              setText(prev => prev + data.content);
              break;

            case 'audio':
              if (!audioQueueRef.current.has(data.playSequence)) {
                audioQueueRef.current.set(data.playSequence, []);
              }
              audioQueueRef.current.get(data.playSequence).push({
                audio: data.audio,
                contentType: data.contentType
              });
              break;

            case 'audio_complete':
              completedRef.current.add(data.playSequence);
              playNextAudio();
              break;

            case 'done':
              setMetrics({
                llm: data.llmMetrics,
                tts: data.ttsMetrics,
                totalTime: data.totalTime
              });
              break;

            case 'error':
            case 'tts_error':
              setError(data.error);
              break;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [baseUrl, playNextAudio]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { text, isStreaming, error, metrics, stream, cancel };
}

// Usage in React Component
function ChatComponent() {
  const { text, isStreaming, error, metrics, stream, cancel } = 
    useStreamingLLM('http://localhost:3000');

  const handleSubmit = async (prompt) => {
    await stream({
      prompt,
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      ttsProvider: 'elevenlabs',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      enableTTS: true
    });
  };

  return (
    <div>
      <button onClick={() => handleSubmit('Hello!')}>Send</button>
      {isStreaming && <button onClick={cancel}>Cancel</button>}
      <div>{text}</div>
      {error && <div className="error">{error}</div>}
      {metrics && (
        <div>
          LLM: {metrics.llm?.totalLatencyMs}ms | 
          TTS: {metrics.tts?.latencyMs}ms | 
          Total: {metrics.totalTime}ms
        </div>
      )}
    </div>
  );
}
```


### Python Client Implementation

```python
"""
Python client for LLM + TTS Streaming API
Requires: pip install requests sseclient-py
"""

import json
import base64
import requests
from sseclient import SSEClient
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from io import BytesIO

@dataclass
class StreamMetrics:
    llm_latency_ms: Optional[int] = None
    tts_latency_ms: Optional[int] = None
    total_time_ms: Optional[int] = None
    time_to_first_token_ms: Optional[int] = None

class LLMTTSStreamClient:
    """Client for streaming LLM responses with TTS audio."""
    
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
    
    def stream(
        self,
        prompt: str,
        llm_provider: str = 'openai',
        llm_model: Optional[str] = None,
        tts_provider: str = 'elevenlabs',
        voice_id: Optional[str] = None,
        enable_tts: bool = True,
        stream_tts: bool = False,
        options: Optional[Dict[str, Any]] = None,
        on_text: Optional[Callable[[str], None]] = None,
        on_audio: Optional[Callable[[bytes, str, int], None]] = None,
        on_done: Optional[Callable[[str, StreamMetrics], None]] = None,
        on_error: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Stream LLM response with optional TTS.
        
        Args:
            prompt: Input text for LLM
            llm_provider: LLM provider (openai, gemini, claude)
            llm_model: Specific model ID
            tts_provider: TTS provider (elevenlabs, inworld)
            voice_id: Voice ID for TTS
            enable_tts: Enable audio generation
            stream_tts: Use streaming TTS
            options: Additional LLM options (maxTokens, temperature)
            on_text: Callback for text chunks
            on_audio: Callback for audio (bytes, content_type, sequence)
            on_done: Callback when complete (full_text, metrics)
            on_error: Callback for errors
            
        Returns:
            Dict with full_text, audio_chunks, and metrics
        """
        payload = {
            'prompt': prompt,
            'llmProvider': llm_provider,
            'ttsProvider': tts_provider,
            'enableTTS': enable_tts,
            'streamTTS': stream_tts,
            'options': options or {}
        }
        
        if llm_model:
            payload['llmModel'] = llm_model
        if voice_id:
            payload['voiceId'] = voice_id
        
        response = requests.post(
            f'{self.base_url}/api/stream',
            json=payload,
            headers={'Content-Type': 'application/json'},
            stream=True
        )
        
        if not response.ok:
            error_msg = response.json().get('error', 'Request failed')
            if on_error:
                on_error(error_msg)
            raise Exception(error_msg)
        
        client = SSEClient(response)
        
        full_text = ''
        audio_chunks = []
        metrics = StreamMetrics()
        
        for event in client.events():
            if not event.data:
                continue
                
            data = json.loads(event.data)
            event_type = data.get('type')
            
            if event_type == 'text':
                content = data.get('content', '')
                full_text += content
                if on_text:
                    on_text(content)
                    
            elif event_type == 'audio':
                audio_b64 = data.get('audio', '')
                audio_bytes = base64.b64decode(audio_b64)
                content_type = data.get('contentType', 'audio/mpeg')
                sequence = data.get('playSequence', 0)
                
                audio_chunks.append({
                    'audio': audio_bytes,
                    'content_type': content_type,
                    'sequence': sequence
                })
                
                if on_audio:
                    on_audio(audio_bytes, content_type, sequence)
                    
            elif event_type == 'done':
                llm_metrics = data.get('llmMetrics', {})
                tts_metrics = data.get('ttsMetrics', {})
                
                metrics.llm_latency_ms = llm_metrics.get('totalLatencyMs')
                metrics.time_to_first_token_ms = llm_metrics.get('timeToFirstTokenMs')
                metrics.tts_latency_ms = tts_metrics.get('latencyMs')
                metrics.total_time_ms = data.get('totalTime')
                
                if on_done:
                    on_done(data.get('fullText', full_text), metrics)
                    
            elif event_type in ('error', 'tts_error'):
                error_msg = data.get('error', 'Unknown error')
                if on_error:
                    on_error(error_msg)
        
        return {
            'full_text': full_text,
            'audio_chunks': audio_chunks,
            'metrics': metrics
        }
    
    def chat(
        self,
        prompt: str,
        provider: str = 'openai',
        model: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Non-streaming LLM request."""
        payload = {
            'prompt': prompt,
            'provider': provider,
            'options': options or {}
        }
        if model:
            payload['model'] = model
            
        response = requests.post(
            f'{self.base_url}/api/chat',
            json=payload
        )
        return response.json()
    
    def tts(
        self,
        text: str,
        provider: str = 'elevenlabs',
        voice_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Non-streaming TTS request."""
        payload = {
            'text': text,
            'provider': provider,
            'options': options or {}
        }
        if voice_id:
            payload['voiceId'] = voice_id
            
        response = requests.post(
            f'{self.base_url}/api/tts',
            json=payload
        )
        
        result = response.json()
        if result.get('audio'):
            result['audio_bytes'] = base64.b64decode(result['audio'])
        return result
    
    def get_providers(self) -> Dict[str, Any]:
        """Get available providers, models, and voices."""
        response = requests.get(f'{self.base_url}/api/providers')
        return response.json()


# Usage Example
if __name__ == '__main__':
    client = LLMTTSStreamClient('http://localhost:3000')
    
    # Get available providers
    providers = client.get_providers()
    print('Available LLM providers:', [p['id'] for p in providers['llm']])
    print('Available TTS providers:', [p['id'] for p in providers['tts']])
    
    # Stream with callbacks
    def on_text(text):
        print(text, end='', flush=True)
    
    def on_audio(audio_bytes, content_type, sequence):
        print(f'\n[Audio chunk {sequence}: {len(audio_bytes)} bytes]')
    
    def on_done(full_text, metrics):
        print(f'\n\nDone! Metrics:')
        print(f'  LLM Latency: {metrics.llm_latency_ms}ms')
        print(f'  TTS Latency: {metrics.tts_latency_ms}ms')
        print(f'  Total Time: {metrics.total_time_ms}ms')
    
    result = client.stream(
        prompt='Tell me a short joke',
        llm_provider='openai',
        llm_model='gpt-4o-mini',
        tts_provider='elevenlabs',
        enable_tts=True,
        on_text=on_text,
        on_audio=on_audio,
        on_done=on_done
    )
    
    # Save audio to file
    for chunk in result['audio_chunks']:
        ext = 'mp3' if chunk['content_type'] == 'audio/mpeg' else 'wav'
        with open(f'audio_{chunk["sequence"]}.{ext}', 'wb') as f:
            f.write(chunk['audio'])
```

### cURL Examples

```bash
# Stream API - Full request with all options
curl -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain machine learning briefly",
    "llmProvider": "openai",
    "llmModel": "gpt-4o-mini",
    "ttsProvider": "elevenlabs",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "enableTTS": true,
    "streamTTS": false,
    "options": {
      "maxTokens": 500,
      "temperature": 0.7
    }
  }'

# Chat API - LLM only
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "provider": "gemini",
    "model": "gemini-2.0-flash"
  }'

# TTS API - Audio only
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test of text to speech.",
    "provider": "elevenlabs",
    "voiceId": "21m00Tcm4TlvDq8ikWAM"
  }'

# Get available providers
curl http://localhost:3000/api/providers
```

---

## Error Handling

### HTTP Error Responses

All endpoints return consistent error format:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Missing required parameters |
| 500 | Internal Server Error - Provider or server error |

### Stream Error Events

During SSE streaming, errors are sent as events:

```json
// General error
{ "type": "error", "error": "Error message" }

// TTS-specific error (audio continues for other sequences)
{ "type": "tts_error", "playSequence": 2, "error": "TTS synthesis failed" }
```

### Error Handling Best Practices

```javascript
// JavaScript error handling
try {
  const response = await fetch('/api/stream', { ... });
  
  if (!response.ok) {
    const { error } = await response.json();
    throw new Error(error);
  }
  
  // Handle stream...
  for await (const event of parseSSE(response)) {
    if (event.type === 'error') {
      console.error('Stream error:', event.error);
      // Optionally retry or notify user
    }
    if (event.type === 'tts_error') {
      console.warn(`TTS failed for sequence ${event.playSequence}`);
      // Skip this audio segment, continue with others
    }
  }
} catch (error) {
  console.error('Request failed:', error.message);
}
```

---

## Available Providers

### LLM Providers

| Provider | ID | Models | Default Model |
|----------|-----|--------|---------------|
| OpenAI | `openai` | gpt-4.1, gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo | gpt-4o-mini |
| Google Gemini | `gemini` | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash | gemini-2.0-flash |
| Anthropic Claude | `claude` | (check /api/providers) | - |

### TTS Providers

| Provider | ID | Audio Format | Streaming Support |
|----------|-----|--------------|-------------------|
| ElevenLabs | `elevenlabs` | audio/mpeg (MP3) | Yes |
| Inworld | `inworld` | audio/wav | Yes |

### ElevenLabs Voices

| Voice ID | Name | Description |
|----------|------|-------------|
| EXAVITQu4vr4xnSDxMaL | Sarah | Soft, warm female voice |
| 21m00Tcm4TlvDq8ikWAM | Rachel | Calm, professional female |
| AZnzlk1XvdvUeBnXmlld | Domi | Strong, confident female |
| ErXwobaYiN019PkySvjV | Antoni | Well-rounded male voice |
| VR6AewLTigWG4xSOukaG | Arnold | Crisp, authoritative male |
| pNInz6obpgDQGcFmaJgB | Adam | Deep, narrative male |
| yoZ06aMxZJJ28mfd3POQ | Sam | Raspy, dynamic male |

### Inworld Voices

| Voice ID | Name | Description |
|----------|------|-------------|
| Alex | Alex | Energetic and expressive mid-range male |
| Ashley | Ashley | Warm, natural female voice |
| Dennis | Dennis | Smooth, calm and friendly male |

---

## Environment Variables

The backend requires these environment variables:

```bash
# LLM Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

# TTS Providers
ELEVENLABS_API_KEY=...
INWORLD_API_KEY=...          # Base64 encoded
INWORLD_BASE_URL=https://api.inworld.ai
```

---

## CORS Configuration

If accessing from a different domain, ensure the backend has CORS configured:

```javascript
// next.config.mjs
export default {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};
```

---

## Audio Playback Sequence

The `playSequence` field ensures correct audio ordering:

1. Text is chunked at natural break points (~100 chars)
2. Each chunk gets a sequential `playSequence` number (0, 1, 2...)
3. TTS runs in parallel for all chunks
4. Client receives `audio` events (possibly out of order)
5. Client receives `audio_complete` when a sequence is fully sent
6. Client plays audio in `playSequence` order
7. `tts_total` indicates total sequences to expect

```
Timeline:
LLM:    [chunk0][chunk1][chunk2][chunk3]
TTS:    [---seq0---][--seq1--][----seq2----][seq3]
Client: Wait for seq0 complete → Play seq0 → Play seq1 → ...
```

---

## Rate Limiting & Best Practices

1. **Implement client-side rate limiting** - Avoid rapid successive requests
2. **Handle partial failures** - TTS errors don't stop text streaming
3. **Buffer audio properly** - Wait for `audio_complete` before playing
4. **Cancel gracefully** - Use AbortController for user cancellation
5. **Monitor metrics** - Track latency for performance optimization

---

## Support

For issues or questions about this API:
- Check the `/api/providers` endpoint for current available options
- Verify API keys are correctly configured
- Check server logs for detailed error messages
