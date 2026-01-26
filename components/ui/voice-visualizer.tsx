
import React, { useEffect, useRef, useCallback } from 'react';

// Enum for Visualizer State
export enum VisualizerState {
  IDLE,      // Waiting for input
  LISTENING, // User is speaking (orange globe)
  THINKING,  // Processing (morphing animation)
  SPEAKING,  // AI is responding (blue globe)
  ERROR
}

interface VisualizerProps {
  state: VisualizerState;
  isCCEnabled?: boolean;
  audioStream: MediaStream | null; // Microphone input for LISTENING
  ttsAudio?: HTMLAudioElement | null; // TTS output for SPEAKING (Legacy)
  outputAnalyser?: AnalyserNode | null; // Direct AnalyserNode for SPEAKING (Gemini Live)
}

const Visualizer: React.FC<VisualizerProps> = ({ state, isCCEnabled = false, audioStream, ttsAudio, outputAnalyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<any[]>([]);

  // Microphone Audio Analysis Refs (for LISTENING)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // TTS Audio Analysis Refs (for SPEAKING)
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ttsDataArrayRef = useRef<Uint8Array | null>(null);
  const ttsConnectedRef = useRef<boolean>(false);

  // More refined amber/coral palette for professional look
  const GOLD_COLORS = [
    [251, 146, 60],   // Warm orange
    [249, 115, 22],   // Deep orange
    [253, 186, 116],  // Soft peach
    [234, 88, 12],    // Rich amber
    [254, 215, 170],  // Light coral cream
  ];

  const BLUE_COLORS = [
    [59, 130, 246],
    [37, 99, 235],
    [96, 165, 250],
    [29, 78, 216],
  ];

  const PARTICLE_COUNT = 2000;
  const TILT_ANGLE = 45 * (Math.PI / 180);

  const v = useRef({
    time: 0,
    rotation: 0,
    amplitude: 0,
    morph: 0,
    colorMix: 0,
    radius: 260,
    targetRadius: 260, // Target radius for smooth transition
    currentY: 0,
    targetY: 0,
    mouseX: 0,
    mouseY: 0,
    targetMouseX: 0,
    targetMouseY: 0,
  });

  // Managed Audio Context Lifecycle
  useEffect(() => {
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    if (audioStream && state === VisualizerState.LISTENING) {
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        source = ctx.createMediaStreamSource(audioStream);
        sourceRef.current = source;
        source.connect(analyser);

        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch (e) {
        console.error("Failed to initialize AudioContext:", e);
      }
    }

    // Cleanup function
    return () => {
      if (source) {
        source.disconnect();
      }
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(e => console.error("Error closing AudioContext:", e));
      }
      // Reset refs
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      dataArrayRef.current = null;
    };
  }, [audioStream, state]);

  // TTS Audio Analysis for SPEAKING state (blue globe reacting to voice output)
  useEffect(() => {
    if (ttsAudio && state === VisualizerState.SPEAKING && !ttsConnectedRef.current) {
      try {
        // Create or reuse audio context
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        ttsAudioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        ttsAnalyserRef.current = analyser;

        // Create source from the audio element
        // Note: For this to work with remote audio, CORS must be set correctly on the server
        // or crossorigin="anonymous" must be set on the audio element
        try {
          const source = ctx.createMediaElementSource(ttsAudio);
          ttsSourceRef.current = source;
          source.connect(analyser);
          analyser.connect(ctx.destination); // Connect to speakers too

          ttsDataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
          ttsConnectedRef.current = true;
          console.log("[Visualizer] TTS audio connected for analysis");
        } catch (err) {
          console.warn("[Visualizer] CORS or source error, visualizer may not react to audio:", err);
          // Fallback: Use simple time-based animation if context fails
        }
      } catch (e) {
        console.error("[Visualizer] Failed to initialize TTS AudioContext:", e);
      }
    } else if (outputAnalyser && state === VisualizerState.SPEAKING) {
      // Direct Analyser usage
      ttsAnalyserRef.current = outputAnalyser;
      ttsDataArrayRef.current = new Uint8Array(outputAnalyser.frequencyBinCount);
      ttsConnectedRef.current = true;
    }

    // Cleanup when audio ends or state changes
    return () => {
      // Don't close context prematurely - let it stay connected
    };
  }, [ttsAudio, outputAnalyser, state]);

  // Reset TTS connection when audio changes
  useEffect(() => {
    if (!ttsAudio && !outputAnalyser) {
      ttsConnectedRef.current = false;
      if (ttsAudioContextRef.current && ttsAudioContextRef.current.state !== 'closed') {
        ttsAudioContextRef.current.close().catch(() => { });
        ttsAudioContextRef.current = null;
      }
      // Only clear if we created them. If passed from outside (outputAnalyser), don't nullify the ref if it's the prop itself?
      // Actually ttsAnalyserRef.current IS the prop in that case.
      ttsAnalyserRef.current = null;
      ttsSourceRef.current = null;
      ttsDataArrayRef.current = null;
    }
  }, [ttsAudio, outputAnalyser]);

  const createParticle = useCallback(() => {
    const goldIdx = Math.floor(Math.random() * GOLD_COLORS.length);
    const blueIdx = Math.floor(Math.random() * BLUE_COLORS.length);
    // Base spherical coordinates
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);

    // Pre-calculate base unit sphere position (x,y,z) for 3D noise
    const baseX = Math.sin(phi) * Math.cos(theta);
    const baseY = Math.sin(phi) * Math.sin(theta);
    const baseZ = Math.cos(phi);

    return {
      theta, phi, baseX, baseY, baseZ,
      ringIndex: Math.floor(Math.random() * 3),
      ringAngle: Math.random() * Math.PI * 2,
      size: Math.random() * 1.5 + 0.5,
      goldRGB: [...GOLD_COLORS[goldIdx]],
      blueRGB: [...BLUE_COLORS[blueIdx]],
      x: 0, y: 0, z: 0, projX: 0, projY: 0, alpha: 0, projScale: 0
    };
  }, []);

  const updateParticle = useCallback((p: any, width: number, height: number) => {
    const { time, rotation, amplitude, morph, colorMix, radius, currentY, mouseX, mouseY } = v.current;

    // Color mixing
    const r = p.goldRGB[0] + (p.blueRGB[0] - p.goldRGB[0]) * colorMix;
    const g = p.goldRGB[1] + (p.blueRGB[1] - p.goldRGB[1]) * colorMix;
    const b = p.goldRGB[2] + (p.blueRGB[2] - p.goldRGB[2]) * colorMix;

    // 3D Noise Calculation (Seamless)
    const noiseFreq = 3.0;
    const noise = Math.sin(p.baseX * noiseFreq + time) *
      Math.cos(p.baseY * noiseFreq + time) *
      Math.sin(p.baseZ * noiseFreq + time);

    const sphereRadius = radius + noise * (amplitude * 60);

    const sx = p.baseX * sphereRadius;
    const sy = p.baseY * sphereRadius;
    const sz = p.baseZ * sphereRadius;

    // Atom Morph
    const ringR = radius * 1.3;
    const angle = p.ringAngle + time * 2.0;
    const cx = ringR * Math.cos(angle);
    const cy = ringR * Math.sin(angle);
    const cz = (Math.random() - 0.5) * 20;

    let tx, ty, tz;
    if (p.ringIndex === 0) { tx = cx; ty = cz; tz = cy; }
    else {
      const tilt = p.ringIndex === 1 ? Math.PI / 3 : -Math.PI / 3;
      tx = cx;
      ty = cy * Math.cos(tilt) - cz * Math.sin(tilt);
      tz = cy * Math.sin(tilt) + cz * Math.cos(tilt);
    }

    const bx = sx + (tx - sx) * morph;
    const by = sy + (ty - sy) * morph;
    const bz = sz + (tz - sz) * morph;

    const finalRotY = rotation + mouseX * 0.2;
    const finalRotX = TILT_ANGLE + mouseY * 0.2;

    const r1x = bx * Math.cos(finalRotY) - bz * Math.sin(finalRotY);
    const r1z = bx * Math.sin(finalRotY) + bz * Math.cos(finalRotY);

    const r2x = r1x * Math.cos(finalRotX) - by * Math.sin(finalRotX);
    const r2y = r1x * Math.sin(finalRotX) + by * Math.cos(finalRotX);
    const r2z = r1z;

    const perspective = 600;
    const scale = perspective / (perspective + r2z + 400);
    p.projX = r2x * scale + width / 2;
    p.projY = r2y * scale + height / 2 + currentY;
    p.projScale = scale;
    p.alpha = scale;
    p.finalColor = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
  }, []);

  const animate = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { alpha: true });
    if (!ctx) return;

    const width = containerRef.current.offsetWidth;
    const height = containerRef.current.offsetHeight;

    if (canvasRef.current.width !== width) {
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = width * dpr;
      canvasRef.current.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, width, height);

    // Get Microphone Audio Level (for LISTENING - orange globe)
    let micAudioLevel = 0;
    if (state === VisualizerState.LISTENING && analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
      const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
      micAudioLevel = Math.max(0, (avg / 128) - 0.1); // Normalize 0-1
    }

    // Capture TTS Audio Level
    let ttsAudioLevel = 0;
    if (state === VisualizerState.SPEAKING && ttsAnalyserRef.current && ttsDataArrayRef.current) {
      ttsAnalyserRef.current.getByteFrequencyData(ttsDataArrayRef.current as any);
      const avg = ttsDataArrayRef.current.reduce((a, b) => a + b, 0) / ttsDataArrayRef.current.length;
      ttsAudioLevel = Math.max(0, (avg / 128) - 0.1); // Normalize for TTS output
    } else if (state === VisualizerState.SPEAKING && !ttsConnectedRef.current) {
      // Fallback simulation if no context
      ttsAudioLevel = 0.3 + Math.sin(performance.now() * 0.01) * 0.1;
    }

    // State Interpolation
    let targetAmp = 0.05, targetMorph = 0, targetColorMix = 0;

    if (state === VisualizerState.IDLE) {
      // Gentle breathing animation when idle
      targetAmp = 0.1 + Math.sin(v.current.time * 2) * 0.02;
      targetColorMix = 0; // Orange
    } else if (state === VisualizerState.LISTENING) {
      // Drive amplitude with Microphone Audio Level (orange globe)
      targetAmp = 0.2 + (micAudioLevel * 1.5);
      targetColorMix = 0; // Orange
    } else if (state === VisualizerState.THINKING) {
      // Atom morph animation with color transition (orange → blue)
      targetAmp = 0.15;
      targetMorph = 1.0;
      targetColorMix = 0.5 + Math.sin(v.current.time * 2) * 0.3; // Pulsing transition
    } else if (state === VisualizerState.SPEAKING) {
      // Drive amplitude with TTS Audio Level (blue globe - reacts to voice)
      targetAmp = 0.15 + (ttsAudioLevel * 1.2); // Still when quiet, vibrates when speaking
      targetColorMix = 1.0; // Blue
    }

    v.current.amplitude += (targetAmp - v.current.amplitude) * 0.15;
    v.current.morph += (targetMorph - v.current.morph) * 0.04;
    v.current.colorMix += (targetColorMix - v.current.colorMix) * 0.08;

    // Adjust globe size and position based on CC mode
    // CC ON: smaller globe (50%) positioned at center-bottom
    // CC OFF: full size globe centered
    const targetRadius = isCCEnabled ? 130 : 260;
    v.current.radius += (targetRadius - v.current.radius) * 0.06;

    // Move globe to bottom when CC is enabled
    v.current.targetY = isCCEnabled ? height * 0.3 : 0;
    v.current.currentY += (v.current.targetY - v.current.currentY) * 0.06;

    v.current.mouseX += (v.current.targetMouseX - v.current.mouseX) * 0.12;
    v.current.mouseY += (v.current.targetMouseY - v.current.mouseY) * 0.12;

    v.current.time += 0.015 + v.current.amplitude * 0.03;
    v.current.rotation += state === VisualizerState.THINKING ? 0.03 : 0.004;

    // Only render a small subset of particles if CC is enabled (small globe) to maintain transparency
    const visibleParticleCount = isCCEnabled ? Math.floor(particlesRef.current.length * 0.35) : particlesRef.current.length;

    particlesRef.current.slice(0, visibleParticleCount).forEach(p => {
      updateParticle(p, width, height);
      const margin = 50;
      if (p.alpha > 0.05 &&
        p.projX > -margin && p.projX < width + margin &&
        p.projY > -margin && p.projY < height + margin) {

        ctx.globalAlpha = Math.min(1, (p.alpha - 0.05) * 3);
        ctx.fillStyle = p.finalColor;
        ctx.beginPath();
        // Lower size factor for "thin" look in CC mode, standard 2.5 for large globe
        const sizeFactor = isCCEnabled ? 1.8 : 2.5;
        ctx.arc(p.projX, p.projY, p.size * p.projScale * sizeFactor, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    animationRef.current = requestAnimationFrame(animate);
  }, [state, isCCEnabled, updateParticle]);

  useEffect(() => {
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, createParticle);
    const handleMouseMove = (e: MouseEvent) => {
      v.current.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      v.current.targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationRef.current);
      // Audio cleanup is handled by the other useEffect
    };
  }, [animate, createParticle]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default Visualizer;
