'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSequence, setCurrentSequence] = useState(0);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  
  // Sequence-based audio buffers: Map<playSequence, audioChunks[]>
  const sequenceBuffersRef = useRef(new Map());
  const completedSequencesRef = useRef(new Set());
  const nextPlaySequenceRef = useRef(0);
  const isProcessingRef = useRef(false);
  const scheduledEndTimeRef = useRef(0);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  const decodeBase64ToBuffer = useCallback((base64Audio) => {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, []);

  // Add audio chunk for a specific sequence
  const addSequenceAudio = useCallback((playSequence, base64Audio, contentType = 'audio/wav') => {
    if (!sequenceBuffersRef.current.has(playSequence)) {
      sequenceBuffersRef.current.set(playSequence, []);
    }
    sequenceBuffersRef.current.get(playSequence).push({ base64Audio, contentType });
  }, []);

  // Mark a sequence as complete (all chunks received)
  const markSequenceComplete = useCallback((playSequence) => {
    completedSequencesRef.current.add(playSequence);
  }, []);

  // Play audio chunks for a sequence
  const playSequenceAudio = useCallback(async (sequence) => {
    const chunks = sequenceBuffersRef.current.get(sequence) || [];
    if (chunks.length === 0) return;

    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    for (const chunk of chunks) {
      try {
        const arrayBuffer = decodeBase64ToBuffer(chunk.base64Audio);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNodeRef.current);

        const currentTime = audioContext.currentTime;
        const startTime = Math.max(currentTime, scheduledEndTimeRef.current);
        
        source.start(startTime);
        scheduledEndTimeRef.current = startTime + audioBuffer.duration;
      } catch (error) {
        console.error('Audio decode error:', error);
      }
    }
  }, [getAudioContext, decodeBase64ToBuffer]);

  // Process sequences in order
  const processSequences = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsPlaying(true);

    while (true) {
      const nextSeq = nextPlaySequenceRef.current;
      
      // Check if next sequence is complete and has audio
      if (completedSequencesRef.current.has(nextSeq)) {
        await playSequenceAudio(nextSeq);
        setCurrentSequence(nextSeq);
        
        // Cleanup played sequence
        sequenceBuffersRef.current.delete(nextSeq);
        completedSequencesRef.current.delete(nextSeq);
        nextPlaySequenceRef.current++;
      } else if (sequenceBuffersRef.current.size === 0 && completedSequencesRef.current.size === 0) {
        // No more audio to play
        break;
      } else {
        // Wait for next sequence to be ready
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    isProcessingRef.current = false;
    
    // Wait for scheduled audio to finish
    const audioContext = audioContextRef.current;
    if (audioContext) {
      const remainingTime = (scheduledEndTimeRef.current - audioContext.currentTime) * 1000;
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
    }
    
    setIsPlaying(false);
  }, [playSequenceAudio]);

  // Start processing when audio is added
  useEffect(() => {
    if (sequenceBuffersRef.current.size > 0 && !isProcessingRef.current) {
      processSequences();
    }
  });

  // Reset for new stream
  const resetPlayer = useCallback(() => {
    sequenceBuffersRef.current.clear();
    completedSequencesRef.current.clear();
    nextPlaySequenceRef.current = 0;
    scheduledEndTimeRef.current = audioContextRef.current?.currentTime || 0;
    setCurrentSequence(0);
    setIsPlaying(false);
    isProcessingRef.current = false;
  }, []);

  // Stop playback
  const stopAudio = useCallback(() => {
    resetPlayer();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }
  }, [resetPlayer]);

  // Set volume
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
    currentSequence,
    addSequenceAudio,
    markSequenceComplete,
    resetPlayer,
    stopAudio,
    setVolume,
    pendingSequences: sequenceBuffersRef.current.size,
    // Simple playback for non-streaming mode
    playAudio: async (base64Audio, contentType = 'audio/mpeg') => {
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
        source.start(0);
        setIsPlaying(true);
        source.onended = () => setIsPlaying(false);
      } catch (error) {
        console.error('Audio playback error:', error);
      }
    },
  };
}
