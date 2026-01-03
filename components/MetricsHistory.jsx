'use client';

import { useState } from 'react';

// Color maps for different providers
const LLM_COLORS = {
  openai: { bg: 'bg-emerald-500/70', text: 'text-emerald-400', label: 'OpenAI' },
  claude: { bg: 'bg-orange-500/70', text: 'text-orange-400', label: 'Claude' },
  gemini: { bg: 'bg-blue-500/70', text: 'text-blue-400', label: 'Gemini' },
  default: { bg: 'bg-purple-500/70', text: 'text-purple-400', label: 'LLM' },
};

const TTS_COLORS = {
  elevenlabs: { bg: 'bg-pink-500/70', text: 'text-pink-400', label: 'ElevenLabs' },
  inworld: { bg: 'bg-cyan-500/70', text: 'text-cyan-400', label: 'Inworld' },
  default: { bg: 'bg-yellow-500/70', text: 'text-yellow-400', label: 'TTS' },
};

function getLLMColor(provider) {
  return LLM_COLORS[provider?.toLowerCase()] || LLM_COLORS.default;
}

function getTTSColor(provider) {
  return TTS_COLORS[provider?.toLowerCase()] || TTS_COLORS.default;
}

export function MetricsHistory({ history, onClear, onDelete, getProviderComparison, getLLMComparison }) {
  const [hoveredEntry, setHoveredEntry] = useState(null);
  const ttsComparison = getProviderComparison();
  const llmComparison = getLLMComparison();

  if (history.length === 0) {
    return (
      <div className="p-6 bg-gray-800/30 rounded-lg border border-gray-700 text-center text-gray-500">
        No metrics recorded yet. Send a query to start collecting data.
      </div>
    );
  }

  // Get unique providers for legend
  const usedLLMProviders = [...new Set(history.map(h => h.llmProvider).filter(Boolean))];
  const usedTTSProviders = [...new Set(history.map(h => h.ttsProvider).filter(Boolean))];

  return (
    <div className="space-y-6">
      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TTS Comparison */}
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 text-white">TTS Provider Comparison</h3>
          <div className="space-y-2">
            {Object.entries(ttsComparison).map(([provider, data]) => {
              const color = getTTSColor(provider);
              return (
                <div key={provider} className="flex justify-between items-center p-2 bg-gray-900/50 rounded">
                  <span className={`capitalize ${color.text}`}>{provider}</span>
                  <div className="text-right">
                    <span className={`font-mono ${color.text}`}>{data.avgLatency}s</span>
                    <span className="text-gray-500 text-sm ml-2">({data.count} calls)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LLM Comparison */}
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 text-white">LLM Provider Comparison</h3>
          <div className="space-y-2">
            {Object.entries(llmComparison).map(([key, data]) => {
              const color = getLLMColor(data.provider);
              return (
                <div key={key} className="flex justify-between items-center p-2 bg-gray-900/50 rounded">
                  <span className="text-gray-300">
                    <span className={`capitalize ${color.text}`}>{data.provider}</span>
                    <span className="text-gray-500 text-sm ml-1">({data.model || 'default'})</span>
                  </span>
                  <div className="text-right">
                    <span className={`font-mono ${color.text}`}>{data.avgLatency}s</span>
                    <span className="text-gray-500 text-sm ml-2">({data.count} calls)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-white">Last {history.length} Requests</h3>
          <button
            onClick={onClear}
            className="px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          >
            Clear History
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">LLM</th>
                <th className="text-left p-2">TTS</th>
                <th className="text-right p-2">LLM Latency</th>
                <th className="text-right p-2">TTS Latency</th>
                <th className="text-right p-2">Total</th>
                <th className="text-center p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => {
                const llmColor = getLLMColor(entry.llmProvider);
                const ttsColor = getTTSColor(entry.ttsProvider);
                return (
                  <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="p-2 text-gray-400">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-2">
                      <span className={`capitalize ${llmColor.text}`}>{entry.llmProvider}</span>
                      {entry.llmModel && (
                        <span className="text-gray-500 text-xs ml-1">({entry.llmModel})</span>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={`capitalize ${ttsColor.text}`}>{entry.ttsProvider}</span>
                    </td>
                    <td className={`p-2 text-right font-mono ${llmColor.text}`}>
                      {((entry.llmMetrics?.latencyMs || entry.llmMetrics?.totalLatencyMs || 0) / 1000).toFixed(2)}s
                    </td>
                    <td className={`p-2 text-right font-mono ${ttsColor.text}`}>
                      {((entry.ttsMetrics?.latencyMs || entry.ttsMetrics?.totalLatencyMs || 0) / 1000).toFixed(2)}s
                    </td>
                    <td className="p-2 text-right font-mono text-orange-400">
                      {((entry.totalTime || 0) / 1000).toFixed(2)}s
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                        title="Delete this entry"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Chart */}
      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-white">Latency Trend</h3>
        <div className="h-48 flex items-end gap-2 relative">
          {history.slice().reverse().map((entry) => {
            const llmLatency = entry.llmMetrics?.latencyMs || entry.llmMetrics?.totalLatencyMs || 0;
            const ttsLatency = entry.ttsMetrics?.latencyMs || entry.ttsMetrics?.totalLatencyMs || 0;
            const maxLatency = Math.max(...history.map(h => 
              (h.llmMetrics?.latencyMs || h.llmMetrics?.totalLatencyMs || 0) + 
              (h.ttsMetrics?.latencyMs || h.ttsMetrics?.totalLatencyMs || 0)
            ), 1);
            const totalHeight = 100;
            const llmHeight = maxLatency > 0 ? Math.max((llmLatency / maxLatency) * totalHeight, llmLatency > 0 ? 8 : 0) : 0;
            const ttsHeight = maxLatency > 0 ? Math.max((ttsLatency / maxLatency) * totalHeight, ttsLatency > 0 ? 8 : 0) : 0;
            const llmColor = getLLMColor(entry.llmProvider);
            const ttsColor = getTTSColor(entry.ttsProvider);
            const isHovered = hoveredEntry === entry.id;

            return (
              <div 
                key={entry.id} 
                className="flex-1 flex flex-col justify-end h-full relative cursor-pointer"
                onMouseEnter={() => setHoveredEntry(entry.id)}
                onMouseLeave={() => setHoveredEntry(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 w-64 p-3 bg-gray-900 border border-gray-600 rounded-lg shadow-xl text-xs">
                    <div className="font-semibold text-white mb-2 truncate">
                      {entry.query || entry.responseText?.slice(0, 50) || 'No text'}
                      {(entry.query?.length > 50 || entry.responseText?.length > 50) && '...'}
                    </div>
                    <div className="space-y-1">
                      <div className={`flex justify-between ${llmColor.text}`}>
                        <span>{entry.llmProvider || 'LLM'}:</span>
                        <span className="font-mono">{(llmLatency / 1000).toFixed(2)}s</span>
                      </div>
                      <div className={`flex justify-between ${ttsColor.text}`}>
                        <span>{entry.ttsProvider || 'TTS'}:</span>
                        <span className="font-mono">{(ttsLatency / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between text-orange-400 border-t border-gray-700 pt-1 mt-1">
                        <span>Total:</span>
                        <span className="font-mono">{((entry.totalTime || 0) / 1000).toFixed(2)}s</span>
                      </div>
                    </div>
                    {entry.responseText && (
                      <div className="mt-2 pt-2 border-t border-gray-700 text-gray-400 line-clamp-3">
                        {entry.responseText.slice(0, 150)}{entry.responseText.length > 150 && '...'}
                      </div>
                    )}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-600" />
                  </div>
                )}
                
                {/* TTS Bar */}
                {ttsLatency > 0 && (
                  <div
                    className={`${ttsColor.bg} rounded-t min-h-[8px] flex items-center justify-center relative transition-all ${isHovered ? 'opacity-100' : 'opacity-70'}`}
                    style={{ height: `${ttsHeight}%` }}
                  >
                    {ttsHeight > 15 && (
                      <span className="text-[10px] font-mono text-white/90 rotate-0 whitespace-nowrap">
                        {(ttsLatency / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                )}
                {/* LLM Bar */}
                {llmLatency > 0 && (
                  <div
                    className={`${llmColor.bg} rounded-b min-h-[8px] flex items-center justify-center relative transition-all ${isHovered ? 'opacity-100' : 'opacity-70'}`}
                    style={{ height: `${llmHeight}%` }}
                  >
                    {llmHeight > 15 && (
                      <span className="text-[10px] font-mono text-white/90 rotate-0 whitespace-nowrap">
                        {(llmLatency / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
          <span className="font-semibold text-gray-300">LLM:</span>
          {usedLLMProviders.map(provider => {
            const color = getLLMColor(provider);
            return (
              <span key={provider} className="flex items-center gap-1">
                <span className={`w-3 h-3 ${color.bg} rounded`} />
                <span className={color.text}>{color.label}</span>
              </span>
            );
          })}
          <span className="font-semibold text-gray-300 ml-2">TTS:</span>
          {usedTTSProviders.map(provider => {
            const color = getTTSColor(provider);
            return (
              <span key={provider} className="flex items-center gap-1">
                <span className={`w-3 h-3 ${color.bg} rounded`} />
                <span className={color.text}>{color.label}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
