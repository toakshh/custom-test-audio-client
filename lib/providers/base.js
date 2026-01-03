// Base provider classes for extensibility

export class BaseLLMProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async generateResponse(prompt, options = {}) {
    throw new Error('generateResponse must be implemented');
  }

  async *streamResponse(prompt, options = {}) {
    throw new Error('streamResponse must be implemented');
  }

  getAvailableModels() {
    throw new Error('getAvailableModels must be implemented');
  }
}

export class BaseTTSProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async synthesize(text, options = {}) {
    throw new Error('synthesize must be implemented');
  }

  async *streamSynthesize(text, options = {}) {
    throw new Error('streamSynthesize must be implemented');
  }

  getAvailableVoices() {
    throw new Error('getAvailableVoices must be implemented');
  }
}
