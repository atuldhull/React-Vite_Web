/**
 * AudioManager — Singleton audio system using Howler.js.
 *
 * Manages:
 *   1. Monument ambient soundscapes (crossfade on monument change)
 *   2. Weather layer sounds (fade in/out with weather)
 *   3. UI sound effects (whoosh, pop, arrive)
 *   4. User controls (mute, master volume, localStorage persistence)
 *   5. Browser autoplay policy compliance (waits for first interaction)
 *   6. prefers-reduced-motion respect
 *
 * Usage:
 *   <AudioProvider>
 *     <App />
 *   </AudioProvider>
 *
 *   const { muted, setMuted, masterVolume, setMasterVolume, playEffect } = useAudio();
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Howl, Howler } from "howler";
import { getMonument } from "@/config/monuments";

// ═══════════════════════════════════════════════════════════
// AUDIO CONTEXT
// ═══════════════════════════════════════════════════════════

const AudioContext = createContext({
  muted: false,
  setMuted: () => {},
  masterVolume: 0.4,
  setMasterVolume: () => {},
  playEffect: () => {},
  playMonumentAmbient: () => {},
  playWeatherSound: () => {},
  stopWeatherSound: () => {},
});

export function useAudio() {
  return useContext(AudioContext);
}

// ═══════════════════════════════════════════════════════════
// AUDIO FILE PATHS (served from frontend/public under /app/)
// ═══════════════════════════════════════════════════════════

const AUDIO_BASE = "/app/audio";

/** Weather-specific sound files */
const WEATHER_SOUNDS = {
  sandstorm: { src: `${AUDIO_BASE}/desert_wind.mp3`, volume: 0.6 },
  rain: { src: `${AUDIO_BASE}/jungle_ambience.mp3`, volume: 0.5 },
  humid_haze: { src: `${AUDIO_BASE}/jungle_ambience.mp3`, volume: 0.3 },
  blizzard: { src: `${AUDIO_BASE}/arctic_wind.mp3`, volume: 0.7 },
  aurora: { src: `${AUDIO_BASE}/arctic_wind.mp3`, volume: 0.2 },
  neon_rain: { src: `${AUDIO_BASE}/city_rain_night.mp3`, volume: 0.5 },
  ember_rain: { src: `${AUDIO_BASE}/volcano_forge.mp3`, volume: 0.4 },
  fog: { src: `${AUDIO_BASE}/sky_winds.mp3`, volume: 0.3 },
  heatwave: { src: `${AUDIO_BASE}/desert_wind.mp3`, volume: 0.4 },
  particle_drift: { src: `${AUDIO_BASE}/underwater_ambient.mp3`, volume: 0.3 },
  current_flow: { src: `${AUDIO_BASE}/underwater_ambient.mp3`, volume: 0.3 },
};

/** UI sound effects (placeholder files — replace with real SFX) */
const UI_SOUNDS = {
  whoosh: `${AUDIO_BASE}/desert_wind.mp3`,
  pop: `${AUDIO_BASE}/sky_winds.mp3`,
  arrive: `${AUDIO_BASE}/desert_wind.mp3`,
};

// ═══════════════════════════════════════════════════════════
// HELPER: Crossfade between two Howl instances
// ═══════════════════════════════════════════════════════════

function fadeOut(howl, duration = 1500) {
  if (!howl || !howl.playing()) return;
  howl.fade(howl.volume(), 0, duration);
  setTimeout(() => {
    howl.stop();
    howl.unload();
  }, duration + 100);
}

function fadeIn(howl, targetVolume, duration = 1500) {
  if (!howl) return;
  howl.volume(0);
  howl.play();
  howl.fade(0, targetVolume, duration);
}

// ═══════════════════════════════════════════════════════════
// PROVIDER COMPONENT
// ═══════════════════════════════════════════════════════════

export function AudioProvider({ children }) {
  // ── User preferences (persisted) ──
  const [muted, setMutedState] = useState(() => {
    try {
      return localStorage.getItem("mc_audio_muted") === "true";
    } catch {
      return false;
    }
  });

  const [masterVolume, setMasterVolumeState] = useState(() => {
    try {
      const stored = localStorage.getItem("mc_audio_volume");
      return stored ? parseFloat(stored) : 0.4;
    } catch {
      return 0.4;
    }
  });

  // ── Track if user has interacted (autoplay policy) ──
  const [userInteracted, setUserInteracted] = useState(false);

  // ── Refs for active audio instances ──
  const ambientRef = useRef(null);      // Current monument ambient
  const weatherRef = useRef(null);      // Current weather layer
  const currentMonumentRef = useRef(""); // Which monument is playing
  const currentWeatherRef = useRef("");  // Which weather sound is playing

  // ── Detect prefers-reduced-motion ──
  const prefersReduced = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  }, []);

  // ── Detect mobile ──
  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  // ── Apply mute to Howler global ──
  useEffect(() => {
    Howler.mute(muted);
    try {
      localStorage.setItem("mc_audio_muted", String(muted));
    } catch { /* ignore */ }
  }, [muted]);

  // ── Apply master volume ──
  useEffect(() => {
    Howler.volume(masterVolume);
    try {
      localStorage.setItem("mc_audio_volume", String(masterVolume));
    } catch { /* ignore */ }
  }, [masterVolume]);

  // ── Wait for first user interaction ──
  useEffect(() => {
    if (userInteracted) return;

    const handler = () => {
      setUserInteracted(true);
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown", handler);
    };

    document.addEventListener("click", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("keydown", handler, { once: true });

    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [userInteracted]);

  // ── Setters with persistence ──
  const setMuted = useCallback((val) => {
    setMutedState(val);
  }, []);

  const setMasterVolume = useCallback((val) => {
    const v = Math.max(0, Math.min(1, val));
    setMasterVolumeState(v);
  }, []);

  // ── Play monument ambient sound ──
  const playMonumentAmbient = useCallback(
    (monumentId) => {
      if (!userInteracted || prefersReduced) return;
      if (monumentId === currentMonumentRef.current) return;

      const monument = getMonument(monumentId);
      if (!monument?.ambientSound) return;

      // Fade out current
      if (ambientRef.current) {
        fadeOut(ambientRef.current, 1500);
      }

      // Create new ambient
      const baseVol = isMobile ? 0.2 : 0.4;
      const newAmbient = new Howl({
        src: [`${AUDIO_BASE}/${monument.ambientSound}`],
        loop: true,
        volume: 0,
        html5: true, // streaming for large ambient files
      });

      ambientRef.current = newAmbient;
      currentMonumentRef.current = monumentId;

      fadeIn(newAmbient, baseVol, 1500);
    },
    [userInteracted, prefersReduced, isMobile],
  );

  // ── Play weather layer sound ──
  const playWeatherSound = useCallback(
    (weatherName) => {
      if (!userInteracted || prefersReduced) return;
      if (weatherName === currentWeatherRef.current) return;

      const config = WEATHER_SOUNDS[weatherName];
      if (!config) {
        // No sound for this weather — stop current if any
        if (weatherRef.current) {
          fadeOut(weatherRef.current, 1500);
          weatherRef.current = null;
          currentWeatherRef.current = "";
        }
        return;
      }

      // Fade out current weather sound
      if (weatherRef.current) {
        fadeOut(weatherRef.current, 1500);
      }

      const newWeather = new Howl({
        src: [config.src],
        loop: true,
        volume: 0,
        html5: true,
      });

      weatherRef.current = newWeather;
      currentWeatherRef.current = weatherName;

      fadeIn(newWeather, config.volume, 1500);
    },
    [userInteracted, prefersReduced],
  );

  // ── Stop weather sound ──
  const stopWeatherSound = useCallback(() => {
    if (weatherRef.current) {
      fadeOut(weatherRef.current, 1500);
      weatherRef.current = null;
      currentWeatherRef.current = "";
    }
  }, []);

  // ── Play UI sound effect (one-shot, no loop) ──
  const playEffect = useCallback(
    (effectName) => {
      if (!userInteracted || muted || prefersReduced) return;

      const src = UI_SOUNDS[effectName];
      if (!src) return;

      const sound = new Howl({
        src: [src],
        volume: effectName === "pop" ? 0.2 : 0.5,
        html5: false, // SFX should use WebAudio for low latency
        onend: function () { this.unload(); }, // prevent memory leak
      });
      sound.play();
    },
    [userInteracted, muted, prefersReduced],
  );

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (ambientRef.current) {
        ambientRef.current.stop();
        ambientRef.current.unload();
      }
      if (weatherRef.current) {
        weatherRef.current.stop();
        weatherRef.current.unload();
      }
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      muted,
      setMuted,
      masterVolume,
      setMasterVolume,
      playEffect,
      playMonumentAmbient,
      playWeatherSound,
      stopWeatherSound,
    }),
    [muted, setMuted, masterVolume, setMasterVolume, playEffect, playMonumentAmbient, playWeatherSound, stopWeatherSound],
  );

  return (
    <AudioContext.Provider value={contextValue}>
      {children}
    </AudioContext.Provider>
  );
}

export default AudioProvider;
