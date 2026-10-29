// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
// Original Snipio sound. No samples, recordings, or third-party audio are used.
const fs = require("node:fs");
const path = require("node:path");
const sampleRate = 44100;
// A soft suspended chord: a gentle onset, low sine voices and a short airy tail.
// Every sample is calculated here; the generator never reads reference audio.
const duration = 0.68;
const samples = Math.floor(sampleRate * duration);
const signal = new Float64Array(samples);
const voices = [
  { frequency: 196, gain: 0.85, delay: 0 },
  { frequency: 261.6256, gain: 0.8, delay: 0.006 },
  { frequency: 349.2282, gain: 0.92, delay: 0.012 },
  { frequency: 466.1638, gain: 0.75, delay: 0.018 }
];
for (let index = 0; index < samples; index++) {
  const time = index / sampleRate;
  for (const voice of voices) {
    const age = time - voice.delay;
    if (age < 0) continue;
    const attack = 1 - Math.exp(-Math.pow(age / 0.039, 2));
    const envelope = attack * Math.exp(-11.5 * age);
    const phase = 2 * Math.PI * voice.frequency * age;
    const detune = Math.sin(phase * 1.001 + 0.3) * 0.16;
    const overtone = Math.sin(phase * 2) * 0.025 * Math.exp(-12 * age);
    signal[index] += voice.gain * envelope * (Math.sin(phase) + detune + overtone);
  }
}
const dry = signal.slice();
for (const [seconds, gain] of [[0.037, 0.14], [0.061, 0.085], [0.093, 0.045]]) {
  const delay = Math.round(seconds * sampleRate);
  for (let index = delay; index < samples; index++) signal[index] += dry[index - delay] * gain;
}
let peak = 0;
for (let index = 0; index < samples; index++) {
  const remaining = (samples - 1 - index) / sampleRate;
  const tail = Math.min(1, remaining / 0.075);
  signal[index] *= tail * tail * (3 - 2 * tail);
  peak = Math.max(peak, Math.abs(signal[index]));
}
const buffer = Buffer.alloc(44 + samples * 2);
buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVE", 8);
buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index++) {
  buffer.writeInt16LE(Math.round(0.1 * 32767 * signal[index] / peak), 44 + index * 2);
}
const target = path.resolve(__dirname, "../extension/assets/sounds/expansion.wav");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buffer);
console.log("Generated extension/assets/sounds/expansion.wav");
