'use client';

export function ResponseDisplay({ response, isStreaming, onStopAudio, isPlaying, queueLength }) {
  if (!response && !isStreaming) {
    return (
      <div className="p-8 bg-gray-800/30 rounded-lg border border-gray-700 text-center text-gray-500">
        <p>Your response will appear here</p>
        <p className="text-sm mt-1">Send a query to get started</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">Response</h3>
          {isStreaming && (
            <span className="flex items-center gap-1 text-sm text-blue-400">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Streaming...
            </span>
          )}
        </div>
        {(isPlaying || queueLength > 0) && (
          <button
            onClick={onStopAudio}
            className="px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors flex items-center gap-1"
          >
            <StopIcon />
            Stop Audio {queueLength > 0 && `(${queueLength} queued)`}
          </button>
        )}
      </div>
      <div className="prose prose-invert max-w-none">
        <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">
          {response || (isStreaming ? '' : 'Waiting for response...')}
          {isStreaming && <span className="animate-pulse">▊</span>}
        </p>
      </div>
      {isPlaying && (
        <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
          <SpeakerIcon />
          <span>Playing audio...</span>
          <span className="flex gap-1">
            <span className="w-1 h-3 bg-green-400 rounded animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-3 bg-green-400 rounded animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-3 bg-green-400 rounded animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}
    </div>
  );
}

function StopIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
}
