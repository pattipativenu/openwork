import React, { useEffect, useState } from 'react';
import { X, Mic, MicOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Visualizer, { VisualizerState } from './voice-visualizer';
import { useGeminiLive } from '@/hooks/useGeminiLive';

interface VoiceChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuery: (text: string) => Promise<string>; // Currently unused in Live Mode, kept for interface compatibility
}

export function VoiceChatModal({ isOpen, onClose }: VoiceChatModalProps) {
  // Use Gemini Live for full speech-to-speech interaction
  const {
    isActive,
    isSpeaking,
    status,
    transcript,
    stream,
    outputAnalyser,
    connect,
    disconnect,
    error
  } = useGeminiLive({
    transcriptionOnly: false,
    systemInstruction: "You are a helpful, empathetic medical AI assistant. Provide concise, accurate medical guidance. Keep responses relatively short and conversational.",
    voiceName: 'Kore'
  });

  // Map Gemini Live state to Visualizer State
  const [visualizerState, setVisualizerState] = useState<VisualizerState>(VisualizerState.IDLE);

  useEffect(() => {
    if (status === 'error') {
      setVisualizerState(VisualizerState.ERROR);
    } else if (isSpeaking) {
      setVisualizerState(VisualizerState.SPEAKING);
    } else if (status === 'connected' || status === 'connecting') {
      // When connected/connecting, we are either listening or thinking/connecting
      // The hook doesn't explicitly distinguish "Thinking" vs "Listening" in a way that matches the old state 
      // (since Live API is always listening/ready).
      // We'll treat 'connecting' as THINKING (pulsing) and 'connected' as LISTENING.
      setVisualizerState(status === 'connecting' ? VisualizerState.THINKING : VisualizerState.LISTENING);
    } else {
      setVisualizerState(VisualizerState.IDLE);
    }
  }, [status, isSpeaking, isActive]);

  // Handle Opening/Closing
  useEffect(() => {
    if (isOpen) {
      if (!isActive) connect();
    } else {
      if (isActive) disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleListening = () => {
    if (isActive) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Back Button (Top Left) */}
          <button
            onClick={onClose}
            className="absolute top-6 left-6 p-2 rounded-full bg-gray-100 hover:bg-gray-200 z-50 flex items-center gap-2 px-4"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-600">Back</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-gray-100 hover:bg-gray-200 z-50"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>

          {/* Visualizer Background */}
          <div className="absolute inset-0 z-0">
            <Visualizer
              state={visualizerState}
              audioStream={stream} // From hook
              outputAnalyser={outputAnalyser} // From hook
              isCCEnabled={false}
            />
          </div>

          {/* Status Text & Transcript */}
          <div className="z-10 absolute bottom-32 text-center w-full max-w-2xl px-6">
            <AnimatePresence mode="wait">
              {visualizerState === VisualizerState.LISTENING && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <p className="text-sm uppercase tracking-widest text-indigo-500 font-semibold mb-2">Listening</p>
                  <p className="text-2xl font-medium text-gray-800 line-clamp-3">
                    {transcript || "Speak naturally..."}
                  </p>
                </motion.div>
              )}

              {visualizerState === VisualizerState.THINKING && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p className="text-xl text-gray-500 animate-pulse">Connecting to Gemini Live...</p>
                </motion.div>
              )}

              {visualizerState === VisualizerState.SPEAKING && (
                <motion.div
                  key="speaking"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <p className="text-sm uppercase tracking-widest text-blue-500 font-semibold mb-2">Gemini is Speaking</p>
                  <p className="text-xl font-medium text-gray-600 line-clamp-3">
                    {transcript}
                  </p>
                </motion.div>
              )}

              {visualizerState === VisualizerState.ERROR && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-red-50 text-red-600 px-4 py-2 rounded-lg inline-flex items-center gap-2"
                >
                  <AlertCircle className="w-5 h-5" />
                  <span>{typeof error === 'string' ? error : 'Connection failed. Check API configuration.'}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="absolute bottom-10 z-10 flex gap-4">
            <button
              onClick={toggleListening}
              className={`p-4 rounded-full shadow-lg transition-all ${isActive
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
            >
              {isActive ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
