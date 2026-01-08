// API route for streaming LLM responses with real-time TTS

import { registry } from '@/lib/providers/registry';

const allowedOrigins = [
  "http://localhost:3013",
  "https://app.ultronai.me",
  "https://dev-app.ultronai.me",
  "http://localhost:3000",
];
function getCorsHeaders(request) {
  const origin = request.headers.get("origin");

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request) {
  try {
    const { 
      prompt, 
      llmProvider = 'openai', 
      llmModel,
      ttsProvider = 'elevenlabs',
      voiceId,
      enableTTS = true,
      streamTTS = false,
      options = {} 
    } = await request.json();

    if (!prompt) {
      return Response.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const llm = registry.getLLMProvider(llmProvider);
    const tts = enableTTS ? registry.getTTSProvider(ttsProvider) : null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const startTime = Date.now();
        let fullText = '';
        let textBuffer = '';
        let llmMetrics = null;
        const CHUNK_SIZE = 100;
        let playSequence = 0;
        const ttsPromises = [];

        // TTS timing metrics
        let firstTtsStartTime = null;  // When first TTS request started
        let firstTtsChunkTime = null;  // When first TTS audio chunk was ready

        // Start TTS for a text chunk with assigned sequence number
        const startTTS = (text, sequence) => {
          const ttsStartTime = Date.now();
          if (firstTtsStartTime === null) {
            firstTtsStartTime = ttsStartTime;
          }
          
          const promise = (async () => {
            try {
              if (streamTTS && typeof tts.streamSynthesize === 'function') {
                for await (const chunk of tts.streamSynthesize(text, { voiceId })) {
                  if (chunk.type === 'chunk') {
                    if (firstTtsChunkTime === null) {
                      firstTtsChunkTime = Date.now();
                    }
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ 
                        type: 'audio', 
                        audio: chunk.audio.toString('base64'),
                        contentType: chunk.contentType,
                        playSequence: sequence,
                        streaming: true,
                        timestampInfo: chunk.timestampInfo,
                      })}\n\n`
                    ));
                  }
                }
              } else {
                const audioResult = await tts.synthesize(text, { voiceId });
                if (firstTtsChunkTime === null) {
                  firstTtsChunkTime = Date.now();
                }
                
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ 
                    type: 'audio', 
                    audio: audioResult.audio.toString('base64'),
                    contentType: audioResult.contentType,
                    playSequence: sequence,
                    metrics: audioResult.metrics,
                  })}\n\n`
                ));
              }
              // Signal this sequence is complete
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'audio_complete', playSequence: sequence })}\n\n`
              ));
            } catch (ttsError) {
              console.error('TTS error:', ttsError);
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tts_error', playSequence: sequence, error: ttsError.message })}\n\n`
              ));
            }
          })();
          ttsPromises.push(promise);
        };

        try {
          // Stream LLM and start TTS in parallel
          for await (const chunk of llm.streamResponse(prompt, { model: llmModel, ...options })) {
            if (chunk.type === 'chunk') {
              fullText += chunk.content;
              textBuffer += chunk.content;

              // Send text chunk to client
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`
              ));

              // Start TTS when buffer reaches threshold
              if (enableTTS && tts && textBuffer.length >= CHUNK_SIZE) {
                const breakPoint = findBreakPoint(textBuffer);
                if (breakPoint > 0) {
                  const textToSpeak = textBuffer.substring(0, breakPoint);
                  textBuffer = textBuffer.substring(breakPoint);
                  startTTS(textToSpeak, playSequence++);
                }
              }
            } else if (chunk.type === 'done') {
              llmMetrics = chunk.metrics;
            }
          }

          // Process remaining text
          if (enableTTS && tts && textBuffer.trim().length > 0) {
            startTTS(textBuffer, playSequence++);
          }

          // Send total sequence count so client knows when all audio is received
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'tts_total', totalSequences: playSequence })}\n\n`
          ));

          // Wait for all TTS to complete
          await Promise.all(ttsPromises);

          // Calculate TTS latency: time from first TTS request to first audio chunk
          const ttsLatencyMs = (firstTtsStartTime && firstTtsChunkTime) 
            ? firstTtsChunkTime - firstTtsStartTime 
            : null;

          // Build final TTS metrics
          const finalTtsMetrics = ttsLatencyMs !== null ? {
            latencyMs: ttsLatencyMs,
          } : null;

          // Send completion event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'done',
              fullText,
              llmMetrics,
              ttsMetrics: finalTtsMetrics,
              totalTime: Date.now() - startTime
            })}\n\n`
          ));

        } catch (error) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
          ));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Stream API error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function findBreakPoint(text) {
  const sentenceBreaks = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  for (const br of sentenceBreaks) {
    const idx = text.lastIndexOf(br);
    if (idx > 0) return idx + br.length;
  }
  
  const clauseBreaks = [', ', '; ', ': ', ',\n'];
  for (const br of clauseBreaks) {
    const idx = text.lastIndexOf(br);
    if (idx > 0) return idx + br.length;
  }
  
  const spaceIdx = text.lastIndexOf(' ');
  if (spaceIdx > 0) return spaceIdx + 1;
  
  return 0;
}
