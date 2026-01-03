// API route for streaming LLM responses with real-time TTS

import { registry } from '@/lib/providers/registry';

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
        
        // Sequential queue for TTS processing
        const ttsQueue = [];
        let chunkIndex = 0;

        // Process TTS sequentially in order
        const processTTSQueue = async () => {
          for (const item of ttsQueue) {
            const { text, index } = item;
            if (!text.trim()) continue;

            try {
              if (streamTTS && typeof tts.streamSynthesize === 'function') {
                for await (const chunk of tts.streamSynthesize(text, { voiceId })) {
                  if (chunk.type === 'chunk') {
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ 
                        type: 'audio', 
                        audio: chunk.audio.toString('base64'),
                        contentType: chunk.contentType,
                        chunkIndex: index,
                        streaming: true,
                        timestampInfo: chunk.timestampInfo,
                      })}\n\n`
                    ));
                  } else if (chunk.type === 'done') {
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ 
                        type: 'tts_metrics', 
                        chunkIndex: index,
                        metrics: chunk.metrics,
                      })}\n\n`
                    ));
                  }
                }
              } else {
                const audioResult = await tts.synthesize(text, { voiceId });
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ 
                    type: 'audio', 
                    audio: audioResult.audio.toString('base64'),
                    contentType: audioResult.contentType,
                    chunkIndex: index,
                    metrics: audioResult.metrics,
                    timestampInfo: audioResult.timestampInfo,
                  })}\n\n`
                ));
              }
            } catch (ttsError) {
              console.error('TTS chunk error:', ttsError);
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tts_error', chunkIndex: index, error: ttsError.message })}\n\n`
              ));
            }
          }
        };

        try {
          // Stream LLM response - collect text chunks first
          for await (const chunk of llm.streamResponse(prompt, { model: llmModel, ...options })) {
            if (chunk.type === 'chunk') {
              fullText += chunk.content;
              textBuffer += chunk.content;

              // Send text chunk to client immediately
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`
              ));

              // Queue TTS at sentence boundaries
              if (enableTTS && tts && textBuffer.length >= CHUNK_SIZE) {
                const breakPoint = findBreakPoint(textBuffer);
                if (breakPoint > 0) {
                  const textToSpeak = textBuffer.substring(0, breakPoint);
                  textBuffer = textBuffer.substring(breakPoint);
                  ttsQueue.push({ text: textToSpeak, index: chunkIndex++ });
                }
              }
            } else if (chunk.type === 'done') {
              llmMetrics = chunk.metrics;
            }
          }

          // Queue remaining text
          if (enableTTS && tts && textBuffer.trim().length > 0) {
            ttsQueue.push({ text: textBuffer, index: chunkIndex++ });
          }

          // Process all TTS in sequence
          await processTTSQueue();

          // Send completion event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'done',
              fullText,
              llmMetrics,
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
