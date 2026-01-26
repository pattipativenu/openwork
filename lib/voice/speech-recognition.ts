
/**
 * Speech Recognition Service
 * Handles real-time voice-to-text conversion with intelligent silence detection.
 */

export interface SpeechRecognitionOptions {
  onResult: (transcript: string, isFinal: boolean) => void;
  onSilence?: (transcript: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  lang?: string;
  silenceTimeout?: number;
}

export class SpeechService {
  private recognition: any;
  private silenceTimer: number | null = null;
  private options: SpeechRecognitionOptions;
  private currentFullTranscript: string = '';
  private isManualStop: boolean = false;
  public isSupported: boolean = false;

  constructor(options: SpeechRecognitionOptions) {
    this.options = options;

    if (typeof window === 'undefined') {
      this.isSupported = false;
      return;
    }

    // Support both standard and WebKit prefixed versions
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.isSupported = false;
      console.error("Speech Recognition API not supported in this browser.");
      return;
    }
    this.isSupported = true;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = options.lang || 'en-US';

    this.recognition.onstart = () => {
      console.log("Speech recognition service started");
      this.currentFullTranscript = '';
      this.isManualStop = false;
      options.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const displayTranscript = finalTranscript + interimTranscript;
      this.currentFullTranscript = displayTranscript;

      options.onResult(displayTranscript, interimTranscript === '');

      // Reset auto-submit timer if there is content
      if (displayTranscript.trim()) {
        this.resetSilenceTimer();
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === 'no-speech') {
        return;
      }
      options.onError?.(event.error);
    };

    this.recognition.onend = () => {
      this.clearSilenceTimer();
      console.log("Speech recognition ended. Manual stop:", this.isManualStop, "Transcript:", this.currentFullTranscript);

      // Only submit if we haven't manually stopped and have text
      if (!this.isManualStop && this.currentFullTranscript.trim()) {
        const text = this.currentFullTranscript;
        this.currentFullTranscript = '';
        this.options.onSilence?.(text);
      }

      options.onEnd?.();
    };
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    const timeout = this.options.silenceTimeout || 2000;
    this.silenceTimer = window.setTimeout(() => {
      if (this.currentFullTranscript.trim()) {
        const text = this.currentFullTranscript;
        this.currentFullTranscript = '';
        console.log("Auto-submitting on silence:", text);
        this.recognition.stop();
        this.options.onSilence?.(text);
      }
    }, timeout);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  public start() {
    if (!this.isSupported || !this.recognition) {
      this.options.onError?.("browser-not-supported");
      return;
    }
    try {
      // Small delay to ensure previous instance is fully cleared
      setTimeout(() => {
        try {
          this.recognition.start();
        } catch (e) {
          console.error("Start error (likely already started):", e);
        }
      }, 50);
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }

  public stop() {
    this.isManualStop = true;
    this.clearSilenceTimer();
    this.currentFullTranscript = '';
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (e) {
      console.log("Error stopping recognition:", e);
    }
  }
}
