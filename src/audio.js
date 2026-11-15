/* ================================================================== */
/* audio — Web Audio ambience + arrival chime, mute by default.        */
/*                                                                     */
/* Nodes are created lazily on first enable: browsers refuse to start  */
/* an AudioContext before a user gesture.                              */
/* ================================================================== */
import { view } from './state.js';

let audioCtx = null, ambience = null, masterGain = null;

function ensureAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.connect(audioCtx.destination);

  // subtle drone: two detuned oscillators through slow filter sweep
  const o1 = audioCtx.createOscillator(), o2 = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const f = audioCtx.createBiquadFilter();
  o1.type = 'sine'; o2.type = 'triangle';
  o1.frequency.value = 55; o2.frequency.value = 55.6;
  g.gain.value = 0.03;
  f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.7;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(masterGain);
  o1.start(); o2.start();
  // slow sweep
  const lfo = audioCtx.createOscillator(); const lfoG = audioCtx.createGain();
  lfo.frequency.value = 0.05; lfoG.gain.value = 80;
  lfo.connect(lfoG); lfoG.connect(f.frequency); lfo.start();
  ambience = { o1, o2, g, f };
}

export function setAudioEnabled(on) {
  if (on) {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (masterGain) masterGain.gain.setTargetAtTime(0.12, audioCtx.currentTime, 0.3);
  } else if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.2);
  }
}

export function playChime() {
  if (!view.sound || !audioCtx || !masterGain) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.7);
}

export function onSoundToggle() {
  setAudioEnabled(view.sound);
  if (view.sound) { try { localStorage.setItem('sol-toggles', JSON.stringify(view)); } catch {} }
}
