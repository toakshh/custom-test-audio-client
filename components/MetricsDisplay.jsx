'use client';

export function MetricsDisplay({ llmMetrics, ttsMetrics, totalTime }) {
  if (!llmMetrics && !ttsMetrics) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      {llmMetrics && (
        <>
          <MetricCard
            label="LLM Latency (TEXT)"
            value={`${((llmMetrics.latencyMs || llmMetrics.totalLatencyMs || 0)/1000).toFixed(2)}s`}
            color="blue"
          />
          {llmMetrics.timeToFirstTokenMs && (
            <MetricCard
              label="Time to First Token"
              value={`${(llmMetrics.timeToFirstTokenMs/1000).toFixed(2)}s`}
              color="cyan"
            />
          )}
          {llmMetrics.tokensUsed > 0 && (
            <MetricCard
              label="Tokens Used"
              value={llmMetrics.tokensUsed}
              color="purple"
            />
          )}
        </>
      )}
      {ttsMetrics && (
        <>
          <MetricCard
            label="TTS Latency (AUDIO)"
            value={`${((ttsMetrics.latencyMs || ttsMetrics.totalLatencyMs || 0)/1000).toFixed(2)}s`}
            color="green"
          />
          {ttsMetrics.audioSizeBytes && (
            <MetricCard
              label="Audio Size"
              value={formatBytes(ttsMetrics.audioSizeBytes)}
              color="yellow"
            />
          )}
        </>
      )}
      {totalTime && (
        <MetricCard
          label="Total Time"
          value={`${(totalTime/1000).toFixed(2)}s`}
          color="orange"
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    green: 'bg-green-500/20 border-green-500/50 text-green-400',
    purple: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
    yellow: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
    orange: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
    cyan: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
