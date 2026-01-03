// Provider Registry - Central place to register and access all providers

import { OpenAIProvider } from './llm/openai';
import { GeminiProvider } from './llm/gemini';
import { ClaudeProvider } from './llm/claude';
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
    this.registerLLMProvider('claude', ClaudeProvider);

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

  getAvailableLLMProviders() {
    const providers = [];
    for (const [name, ProviderClass] of this.llmProviders) {
      const instance = new ProviderClass();
      providers.push({
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        models: instance.getAvailableModels(),
      });
    }
    return providers;
  }

  getAvailableTTSProviders() {
    const providers = [];
    for (const [name, ProviderClass] of this.ttsProviders) {
      const instance = new ProviderClass();
      providers.push({
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        voices: instance.getAvailableVoices(),
      });
    }
    return providers;
  }
}

// Singleton instance
export const registry = new ProviderRegistry();
