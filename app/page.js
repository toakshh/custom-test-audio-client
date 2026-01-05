'use client';

import { useState, useEffect, useCallback } from 'react';
import { QueryInput } from '@/components/QueryInput';
import { ProviderSelector } from '@/components/ProviderSelector';
import { ResponseDisplay } from '@/components/ResponseDisplay';
import { MetricsDisplay } from '@/components/MetricsDisplay';
import { MetricsHistory } from '@/components/MetricsHistory';
import { useMetrics } from '@/lib/hooks/useMetrics';
import { useAudioPlayer } from '@/lib/hooks/useAudioPlayer';

export default function Home() {
  // Provider state
  const [providers, setProviders] = useState({ llm: [], tts: [] });
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [ttsProvider, setTtsProvider] = useState('elevenlabs');
  const [ttsVoice, setTtsVoice] = useState('EXAVITQu4vr4xnSDxMaL');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMode, setStreamingMode] = useState(false);
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  // Current request metrics
  const [currentMetrics, setCurrentMetrics] = useState({
    llmMetrics: null,
    ttsMetrics: null,
    totalTime: null,
  });

  // Hooks
  const { metricsHistory, addMetrics, clearMetrics, deleteMetric, getProviderComparison, getLLMComparison } = useMetrics();
  const { isPlaying, playAudio, addSequenceAudio, markSequenceComplete, resetPlayer, stopAudio } = useAudioPlayer();

  // Streaming TTS mode (for providers that support it like Inworld)
  const [streamTTS, setStreamTTS] = useState(false);

  // Fetch available providers on mount
  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => {
        setProviders(data);
        // Set defaults
        if (data.llm?.[0]) {
          setLlmProvider(data.llm[0].id);
          if (data.llm[0].models?.[0]) {
            setLlmModel(data.llm[0].models[0].id);
          }
        }
        if (data.tts?.[0]) {
          setTtsProvider(data.tts[0].id);
          if (data.tts[0].voices?.[0]) {
            setTtsVoice(data.tts[0].voices[0].id);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Handle provider change - update model/voice to first available
  const handleLlmProviderChange = useCallback((provider) => {
    setLlmProvider(provider);
    const providerData = providers.llm.find((p) => p.id === provider);
    if (providerData?.models?.[0]) {
      setLlmModel(providerData.models[0].id);
    }
  }, [providers.llm]);

  const handleTtsProviderChange = useCallback(async (provider) => {
    setTtsProvider(provider);
    
    // For Inworld, fetch voices dynamically
    if (provider === 'inworld') {
      try {
        const res = await fetch(`/api/providers/voices?provider=${provider}`);
        const data = await res.json();
        if (data.voices?.length > 0) {
          // Update providers state with fetched voices
          setProviders(prev => ({
            ...prev,
            tts: prev.tts.map(p => 
              p.id === provider ? { ...p, voices: data.voices } : p
            )
          }));
          setTtsVoice(data.voices[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch Inworld voices:', error);
        // Fall back to default voice
        const providerData = providers.tts.find((p) => p.id === provider);
        if (providerData?.voices?.[0]) {
          setTtsVoice(providerData.voices[0].id);
        }
      }
    } else {
      const providerData = providers.tts.find((p) => p.id === provider);
      if (providerData?.voices?.[0]) {
        setTtsVoice(providerData.voices[0].id);
      }
    }
  }, [providers.tts]);

  // Standard (non-streaming) request
  const handleStandardRequest = async (query) => {
    const startTime = Date.now();
    setIsLoading(true);
    setResponse('');
    setCurrentMetrics({ llmMetrics: null, ttsMetrics: null, totalTime: null });

    try {
      // Step 1: Get LLM response
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          provider: llmProvider,
          model: llmModel,
        }),
      });

      const chatData = await chatRes.json();
      if (!chatData.success) throw new Error(chatData.error);

      setResponse(chatData.text);
      const llmMetrics = chatData.metrics;

      // Step 2: Convert to speech
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chatData.text,
          provider: ttsProvider,
          voiceId: ttsVoice,
        }),
      });

      const ttsData = await ttsRes.json();
      if (!ttsData.success) throw new Error(ttsData.error);

      const totalTime = Date.now() - startTime;
      const ttsMetrics = ttsData.metrics;

      // Update metrics
      setCurrentMetrics({ llmMetrics, ttsMetrics, totalTime });
      addMetrics({
        llmProvider,
        llmModel,
        ttsProvider,
        llmMetrics,
        ttsMetrics,
        totalTime,
        query,
        responseText: chatData.text,
      });

      // Play audio
      playAudio(ttsData.audio, ttsData.contentType);
    } catch (error) {
      console.error('Request error:', error);
      setResponse(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Streaming request with parallel TTS
  const handleStreamingRequest = async (query) => {
    const startTime = Date.now();
    setIsLoading(true);
    setIsStreaming(true);
    setResponse('');
    setCurrentMetrics({ llmMetrics: null, ttsMetrics: null, totalTime: null });
    
    // Reset audio player for new stream
    resetPlayer();

    let fullResponseText = '';

    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          llmProvider,
          llmModel,
          ttsProvider,
          voiceId: ttsVoice,
          enableTTS: true,
          streamTTS: streamTTS && ttsProvider === 'inworld',
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let llmMetrics = null;
      let ttsMetrics = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'text') {
                fullResponseText += data.content;
                setResponse((prev) => prev + data.content);
              } else if (data.type === 'audio') {
                // Add audio to sequence buffer
                addSequenceAudio(data.playSequence, data.audio, data.contentType);
                // Keep track of individual chunk metrics as fallback
                if (data.metrics) {
                  ttsMetrics = data.metrics;
                }
              } else if (data.type === 'audio_complete') {
                // Mark sequence as complete - ready to play in order
                markSequenceComplete(data.playSequence);
              } else if (data.type === 'done') {
                llmMetrics = data.llmMetrics;
                // Use aggregated TTS metrics from server if available
                if (data.ttsMetrics) {
                  ttsMetrics = data.ttsMetrics;
                }
                const totalTime = Date.now() - startTime;

                setCurrentMetrics({
                  llmMetrics,
                  ttsMetrics,
                  totalTime,
                });

                addMetrics({
                  llmProvider,
                  llmModel,
                  ttsProvider,
                  llmMetrics,
                  ttsMetrics,
                  totalTime,
                  query,
                  responseText: fullResponseText,
                });
              } else if (data.type === 'error') {
                throw new Error(data.error);
              } else if (data.type === 'tts_error') {
                console.error('TTS error:', data.error);
                // Mark failed sequence as complete so playback continues
                markSequenceComplete(data.playSequence);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      setResponse((prev) => prev + `\n\nError: ${error.message}`);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSubmit = (query) => {
    if (streamingMode) {
      handleStreamingRequest(query);
    } else {
      handleStandardRequest(query);
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AI Voice Assistant</h1>
          <p className="text-gray-400">
            Multi-provider LLM + TTS with real-time streaming and metrics
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>
            Chat
          </TabButton>
          <TabButton active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')}>
            Metrics History ({metricsHistory.length})
          </TabButton>
        </div>

        {activeTab === 'chat' ? (
          <div className="space-y-6">
            {/* Provider Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
              <ProviderSelector
                label="LLM Provider"
                providers={providers.llm}
                selectedProvider={llmProvider}
                selectedModel={llmModel}
                onProviderChange={handleLlmProviderChange}
                onModelChange={setLlmModel}
                modelKey="models"
                modelLabel="Model"
              />
              <ProviderSelector
                label="TTS Provider"
                providers={providers.tts}
                selectedProvider={ttsProvider}
                selectedModel={ttsVoice}
                onProviderChange={handleTtsProviderChange}
                onModelChange={setTtsVoice}
                modelKey="voices"
                modelLabel="Voice"
              />
            </div>

            {/* Query Input */}
            <QueryInput
              onSubmit={handleSubmit}
              isLoading={isLoading}
              streamingMode={streamingMode}
              onStreamingModeChange={setStreamingMode}
              streamTTS={streamTTS}
              onStreamTTSChange={setStreamTTS}
              ttsProvider={ttsProvider}
            />

            {/* Response Display */}
            <ResponseDisplay
              response={response}
              isStreaming={isStreaming}
              onStopAudio={stopAudio}
              isPlaying={isPlaying}
            />

            {/* Current Metrics */}
            <MetricsDisplay
              llmMetrics={currentMetrics.llmMetrics}
              ttsMetrics={currentMetrics.ttsMetrics}
              totalTime={currentMetrics.totalTime}
            />
          </div>
        ) : (
          <MetricsHistory
            history={metricsHistory}
            onClear={clearMetrics}
            onDelete={deleteMetric}
            getProviderComparison={getProviderComparison}
            getLLMComparison={getLLMComparison}
          />
        )}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
