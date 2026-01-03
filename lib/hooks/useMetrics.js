'use client';

import { useState, useCallback, useEffect } from 'react';

const MAX_HISTORY = 20;
const STORAGE_KEY = 'metrics_history';

function loadFromStorage() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(history) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

export function useMetrics() {
  const [metricsHistory, setMetricsHistory] = useState([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.length > 0) {
      setMetricsHistory(stored);
    }
  }, []);

  const addMetrics = useCallback((metrics) => {
    setMetricsHistory((prev) => {
      const newHistory = [
        {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          ...metrics,
        },
        ...prev,
      ].slice(0, MAX_HISTORY);
      saveToStorage(newHistory);
      return newHistory;
    });
  }, []);

  const clearMetrics = useCallback(() => {
    setMetricsHistory([]);
    saveToStorage([]);
  }, []);

  const deleteMetric = useCallback((id) => {
    setMetricsHistory((prev) => {
      const newHistory = prev.filter((entry) => entry.id !== id);
      saveToStorage(newHistory);
      return newHistory;
    });
  }, []);

  const getProviderComparison = useCallback(() => {
    const comparison = {
      elevenlabs: { count: 0, totalLatency: 0, avgLatency: 0 },
      inworld: { count: 0, totalLatency: 0, avgLatency: 0 },
    };

    metricsHistory.forEach((entry) => {
      const latency = entry.ttsMetrics?.latencyMs || entry.ttsMetrics?.totalLatencyMs;
      if (entry.ttsProvider && latency) {
        const provider = entry.ttsProvider;
        if (comparison[provider]) {
          comparison[provider].count++;
          comparison[provider].totalLatency += latency;
        }
      }
    });

    // Calculate averages in seconds with 2 decimal places
    Object.keys(comparison).forEach((provider) => {
      if (comparison[provider].count > 0) {
        comparison[provider].avgLatency = (
          comparison[provider].totalLatency / comparison[provider].count / 1000
        ).toFixed(2);
      }
    });

    return comparison;
  }, [metricsHistory]);

  const getLLMComparison = useCallback(() => {
    const comparison = {};

    metricsHistory.forEach((entry) => {
      const latency = entry.llmMetrics?.latencyMs || entry.llmMetrics?.totalLatencyMs;
      if (entry.llmProvider && latency) {
        const key = `${entry.llmProvider}:${entry.llmModel || 'default'}`;
        if (!comparison[key]) {
          comparison[key] = { count: 0, totalLatency: 0, avgLatency: 0, provider: entry.llmProvider, model: entry.llmModel };
        }
        comparison[key].count++;
        comparison[key].totalLatency += latency;
      }
    });

    // Calculate averages in seconds with 2 decimal places
    Object.keys(comparison).forEach((key) => {
      comparison[key].avgLatency = (
        comparison[key].totalLatency / comparison[key].count / 1000
      ).toFixed(2);
    });

    return comparison;
  }, [metricsHistory]);

  return {
    metricsHistory,
    addMetrics,
    clearMetrics,
    deleteMetric,
    getProviderComparison,
    getLLMComparison,
  };
}
