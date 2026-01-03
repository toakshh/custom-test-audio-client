'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const isProcessingRef = useRef(false);
  const scheduledEndTimeRef = useRef(0);
  const gainNodeRef = useRef(null);

  // Initialize audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      // Create a gain node for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  // Decode base64 to ArrayBuffer
  const decodeBase64ToBuffer = useCallback((base64Audio) => {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, []);

  // Play audio from base64 (single shot)
  const playAudio = useCallback(async (base64Audio, contentType = 'audio/mpeg') => {
    try {
      const audioContext = getAudioContext();
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const arrayBuffer = decodeBase64ToBuffer(base64Audio);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current);
      
      sourceNodeRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };

      source.start(0);
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsPlaying(false);
    }
  }, [getAudioContext, decodeBase64ToBuffer]);

  // Queue audio for sequential playback
  const queueAudio = useCallback((base64Audio, contentType = 'audio/mpeg') => {
    setAudioQueue((prev) => [...prev, { base64Audio, contentType }]);
  }, []);

  // Schedule audio for seamless streaming playback
  const scheduleStreamingAudio = useCallback(async (base64Audio, contentType = 'audio/wav') => {
    try {
      const audioContext = getAudioContext();
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const arrayBuffer = decodeBase64ToBuffer(base64Audio);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current);

      // Schedule this chunk to play after the previous one
      const currentTime = audioContext.currentTime;
      const startTime = Math.max(currentTime, scheduledEndTimeRef.current);
      
      source.start(startTime);
      scheduledEndTimeRef.current = startTime + audioBuffer.duration;

      setIsPlaying(true);

      source.onended = () => {
        // Check if this was the last scheduled audio
        if (audioContext.currentTime >= scheduledEndTimeRef.current - 0.1) {
          setIsPlaying(false);
        }
      };

      return { duration: audioBuffer.duration, startTime };
    } catch (error) {
      console.error('Streaming audio error:', error);
      return null;
    }
  }, [getAudioContext, decodeBase64ToBuffer]);

  // Process audio queue
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || audioQueue.length === 0) return;

    isProcessingRef.current = true;
    const [current, ...rest] = audioQueue;
    setAudioQueue(rest);

    try {
      const audioContext = getAudioContext();
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const arrayBuffer = decodeBase64ToBuffer(current.base64Audio);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current);
      
      sourceNodeRef.current = source;
      setIsPlaying(true);

      await new Promise((resolve) => {
        source.onended = resolve;
        source.start(0);
      });
    } catch (error) {
      console.error('Queue playback error:', error);
    }

    setIsPlaying(false);
    sourceNodeRef.current = null;
    isProcessingRef.current = false;
  }, [audioQueue, getAudioContext, decodeBase64ToBuffer]);

  // Auto-process queue
  useEffect(() => {
    if (audioQueue.length > 0 && !isProcessingRef.current) {
      processQueue();
    }
  }, [audioQueue, processQueue]);

  // Stop playback
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    setAudioQueue([]);
    setIsPlaying(false);
    isProcessingRef.current = false;
    scheduledEndTimeRef.current = 0;
  }, []);

  // Reset streaming state (call before starting new stream)
  const resetStreaming = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (audioContext) {
      scheduledEndTimeRef.current = audioContext.currentTime;
    } else {
      scheduledEndTimeRef.current = 0;
    }
  }, []);

  // Set volume (0-1)
  const setVolume = useCallback((volume) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlaying,
    playAudio,
    queueAudio,
    scheduleStreamingAudio,
    stopAudio,
    resetStreaming,
    setVolume,
    queueLength: audioQueue.length,
  };
}
