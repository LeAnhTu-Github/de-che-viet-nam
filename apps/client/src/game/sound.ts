/**
 * sound.ts — Âm thanh tổng hợp bằng WebAudio (không cần asset ngoài).
 * Phase 5: trống đồng khi lên đời. Phase 7: bộ sfx đầy đủ (chọn/ra lệnh/
 * khai thác/chiến đấu/báo động/thắng-thua) + công tắc tắt mở.
 */

let ctx: AudioContext | null = null;
/** true = tắt tiếng (lưu localStorage). */
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('aoevn_muted') === '1';

export function isMuted(): boolean { return muted; }

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem('aoevn_muted', m ? '1' : '0'); } catch { /* bỏ qua */ }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Beep ngắn: tần số → tần số, envelope tắt dần. */
function blip(ac: AudioContext, when: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

/** Noise burst qua lowpass — dùng cho chém/đào/vỗ. */
function noiseHit(ac: AudioContext, when: number, dur: number, gain: number, cutoff: number): void {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(when);
}

/** Một tiếng trống: sine trầm tụt dần + noise vỗ mặt trống. */
function drumHit(ac: AudioContext, when: number, gain: number): void {
  const t = when;
  // Thân trống: sine 70Hz → 40Hz
  const osc = ac.createOscillator();
  const og = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
  og.gain.setValueAtTime(gain, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc.connect(og).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.65);
  // Mặt trống: noise burst ngắn
  const len = Math.floor(ac.sampleRate * 0.12);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(gain * 0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  noise.connect(filter).connect(ng).connect(ac.destination);
  noise.start(t);
}

/** Trống đồng dồn dập khi lên đời: 3 tiếng mạnh dần. */
export function playAgeUpDrum(): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.02;
  drumHit(ac, t0, 0.5);
  drumHit(ac, t0 + 0.35, 0.65);
  drumHit(ac, t0 + 0.7, 0.85);
}

/** Click chọn unit/nhà: blip cao ngắn. */
export function playSelect(): void {
  const ac = audio();
  if (!ac) return;
  blip(ac, ac.currentTime + 0.01, 880, 660, 0.08, 0.12, 'triangle');
}

/** Ra lệnh di chuyển: blip trầm. */
export function playMoveOrder(): void {
  const ac = audio();
  if (!ac) return;
  blip(ac, ac.currentTime + 0.01, 440, 330, 0.1, 0.14, 'triangle');
}

/** Lệnh tấn công: blip gắt hơn. */
export function playAttackOrder(): void {
  const ac = audio();
  if (!ac) return;
  blip(ac, ac.currentTime + 0.01, 520, 260, 0.12, 0.16, 'sawtooth');
}

/** Lệnh xây: gõ gỗ. */
export function playBuildOrder(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  noiseHit(ac, t, 0.06, 0.2, 1800);
  blip(ac, t, 220, 180, 0.08, 0.1, 'square');
}

/** Lệnh khai thác: lách cách nhẹ. */
export function playGatherOrder(): void {
  const ac = audio();
  if (!ac) return;
  noiseHit(ac, ac.currentTime + 0.01, 0.05, 0.12, 3000);
}

/** Kiếm chém trúng: xoẹt noise. */
export function playHit(): void {
  const ac = audio();
  if (!ac) return;
  noiseHit(ac, ac.currentTime + 0.01, 0.09, 0.16, 2500);
}

/** Cung bắn: twang dây. */
export function playShoot(): void {
  const ac = audio();
  if (!ac) return;
  blip(ac, ac.currentTime + 0.01, 300, 900, 0.09, 0.1, 'triangle');
}

/** Báo động: nhà/unit phe mình bị đánh — chuông 2 tiếng. */
export function playAlarm(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  blip(ac, t, 1180, 1180, 0.25, 0.2, 'square');
  blip(ac, t + 0.3, 1180, 1180, 0.25, 0.2, 'square');
}

/** Xây xong nhà: gõ gỗ vui. */
export function playBuildDone(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  blip(ac, t, 523, 523, 0.12, 0.14, 'triangle');
  blip(ac, t + 0.13, 784, 784, 0.16, 0.14, 'triangle');
}

/** Thắng trận: fanfare 3 nốt lên. */
export function playVictory(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  [392, 523, 659].forEach((f, i) => blip(ac, t + i * 0.22, f, f, 0.3, 0.18, 'triangle'));
}

/** Thua trận: 2 nốt trầm xuống. */
export function playDefeat(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  blip(ac, t, 330, 330, 0.35, 0.18, 'triangle');
  blip(ac, t + 0.35, 220, 196, 0.5, 0.18, 'triangle');
}
