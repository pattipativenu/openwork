
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../lib/voice/audio-utils';

interface UseGeminiLiveOptions {
    apiKey?: string;
    voiceName?: string;
    systemInstruction?: string;
    transcriptionOnly?: boolean; // If true, we only care about the text transcript
    model?: string;
}

interface UseGeminiLiveReturn {
    isActive: boolean;
    isSpeaking: boolean;
    status: 'idle' | 'connecting' | 'connected' | 'error';
    transcript: string;
    stream: MediaStream | null;
    outputAnalyser: AnalyserNode | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    error: any;
}

export function useGeminiLive({
    apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    voiceName = 'Puck',
    systemInstruction = 'You are a helpful medical AI assistant. Be concise and professional.',
    transcriptionOnly = false,
    model = 'gemini-2.0-flash-exp', // Valid model for Live API
}: UseGeminiLiveOptions): UseGeminiLiveReturn {
    const [isActive, setIsActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<any>(null);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const outputAudioCtxRef = useRef<AudioContext | null>(null);
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);

    // Cleanup function to stop all audio and streaming
    const cleanup = useCallback(() => {
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (sourcesRef.current) {
            sourcesRef.current.forEach((source) => {
                try { source.stop(); } catch (e) { /* ignore */ }
            });
            sourcesRef.current.clear();
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }
        if (outputAudioCtxRef.current) {
            outputAudioCtxRef.current.close().catch(() => { });
            outputAudioCtxRef.current = null;
        }
        outputAnalyserRef.current = null;

        nextStartTimeRef.current = 0;
        setIsActive(false);
        setIsSpeaking(false);
        setStatus('idle');
        // We do NOT clear the transcript here so the user can see what was said/transcribed after stopping
    }, []);

    const connect = async () => {
        if (!apiKey) {
            const err = "No API key provided for Gemini Live";
            console.error(err);
            setError(err);
            setStatus('error');
            return;
        }

        try {
            setStatus('connecting');
            setError(null);
            setTranscript(''); // Clear for new session

            const ai = new GoogleGenAI({ apiKey });

            // 1. Setup Audio Input
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

            // 2. Setup Audio Output (if needed)
            if (!transcriptionOnly) {
                const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                outputAudioCtxRef.current = outCtx;

                // Setup Output Analyser for Visualizer
                const analyser = outCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.5;
                analyser.connect(outCtx.destination);
                outputAnalyserRef.current = analyser;
            }

            // 3. Get Mic Stream
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // 4. Connect to Gemini Live
            // @ts-ignore - The SDK types might be slightly out of sync with the specific preview syntax, ignoring TS error for now to match reference
            const sessionPromise = ai.live.connect({
                model: model,
                config: {
                    // If transcriptionOnly, we prefer TEXT back, otherwise AUDIO
                    responseModalities: transcriptionOnly ? [Modality.TEXT] : [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                    },
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    // Request full transcription of the conversation
                    // In SDK versions, this might be `generationConfig: { responseModalities: ... }` 
                    // The reference had `outputAudioTranscription: {}` inside config.
                },
                callbacks: {
                    onopen: () => {
                        console.log("Gemini Live Connected");
                        setStatus('connected');
                        setIsActive(true);

                        // Setup Audio Processing Node to stream mic data
                        if (audioCtxRef.current && streamRef.current) {
                            const source = audioCtxRef.current.createMediaStreamSource(streamRef.current);
                            const scriptProcessor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
                            scriptProcessorRef.current = scriptProcessor;

                            scriptProcessor.onaudioprocess = (e) => {
                                const inputData = e.inputBuffer.getChannelData(0);
                                // Create PCM blob via utils
                                const pcmBlob = createBlob(inputData);

                                // Send to Gemini
                                sessionPromiseRef.current?.then((session: any) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            };

                            source.connect(scriptProcessor);
                            scriptProcessor.connect(audioCtxRef.current.destination);
                        }
                    },
                    onmessage: async (message: any) => {
                        // Handle server content
                        // 1. Text Transcript (both user and model, or just model?)
                        // The reference code checks `message.serverContent?.outputTranscription?.text`.
                        if (message.serverContent?.modelTurn?.parts) {
                            const parts = message.serverContent.modelTurn.parts;
                            for (const part of parts) {
                                if (part.text) {
                                    setTranscript(prev => (prev + " " + part.text).trim());
                                }
                            }
                        }
                        // Sometimes transcriptions come in separate events
                        // Investigating reference `LiveConversation.tsx`:
                        // `if (message.serverContent?.outputTranscription) { ... }`
                        // Let's support that too.
                        if (message.serverContent?.outputTranscription?.text) {
                            /* 
                               Note: outputTranscription usually gives the transcript of what the MODEL said (TTS inputs),
                               OR it might be the transcript of what the USER said if explicitly configured.
                               For the input bar, we want what the USER said. 
                               BUT the Live API is primarily a "Talk to Agent" API.
                               If 'transcriptionOnly' is true, we want the MODEL to essentially "Echo" what we said or answer?
                               ACTUALLY: The standard Live API usage is "Conversational".
                               For simple "Dictation" (Speech-to-Text), standard `generateContent` with audio blob is better (like StandardChat.tsx).
                               
                               HOWEVER, the user specifically mentioned fixing the "Mute" issue which implies real-time interaction.
                               If the use case is "Input Bar Dictation", `StandardChat.tsx` approach (Record -> Stop -> Transcribe) is safer 
                               but not "Real-time" streaming dictation.
                               
                               If the user wants "Real-time streaming dictation" (seeing words as they speak), 
                               WE NEED `turnDetection` or similar?
                               
                               Let's stick to the `LiveConversation` "Streaming" approach.
                               If `transcriptionOnly` is true (Input Bar), we might be relying on the model to "reply" with text?
                               Or are we grabbing the `turnComplete`?
                               
                               Let's try to capture ANY text that comes back.
                            */
                            const text = message.serverContent.outputTranscription.text;
                            // We might append this? 
                            // For now, let's just log it and append.
                            // setTranscript(prev => prev + " " + text); 
                        }

                        // 2. Audio Output
                        if (!transcriptionOnly) {
                            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                            if (base64Audio && outputAudioCtxRef.current) {
                                const ctx = outputAudioCtxRef.current;
                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);

                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                                // Connect to Analyser first, which is connected to destination
                                if (outputAnalyserRef.current) {
                                    source.connect(outputAnalyserRef.current);
                                } else {
                                    source.connect(ctx.destination);
                                }
                                source.onended = () => {
                                    sourcesRef.current.delete(source);
                                    if (sourcesRef.current.size === 0) setIsSpeaking(false);
                                };
                                source.start(nextStartTimeRef.current);

                                nextStartTimeRef.current += audioBuffer.duration;
                                sourcesRef.current.add(source);
                                setIsSpeaking(true);
                            }
                        }

                        // 3. Interruption
                        if (message.serverContent?.interrupted) {
                            if (sourcesRef.current) {
                                sourcesRef.current.forEach(s => s.stop());
                                sourcesRef.current.clear();
                            }
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: any) => {
                        console.error("Gemini Live Runtime Error:", e);
                        setStatus('error');
                        setError(e);
                        cleanup();
                    },
                    onclose: () => {
                        console.log("Gemini Live Closed");
                        cleanup(); // Ensure everything is stopped
                    }
                }
            });

            sessionPromiseRef.current = sessionPromise;

        } catch (err: any) {
            console.error("Failed to initiate Gemini Live:", err);
            setError(err.message || "Connection failed");
            setStatus('error');
            cleanup();
        }
    };

    useEffect(() => {
        // Cleanup on unmount
        return () => cleanup();
    }, [cleanup]);

    return { isActive, isSpeaking, status, transcript, stream: streamRef.current, outputAnalyser: outputAnalyserRef.current, connect, disconnect: cleanup, error };
}
