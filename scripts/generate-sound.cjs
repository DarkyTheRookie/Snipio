// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
// Original Snipio sound. No samples, recordings, or third-party audio are used.
const fs = require("node:fs");
const path = require("node:path");
const sampleRate = 44100;
const duration = 0.22;
const samples = Math.floor(sampleRate * duration);
const buffer = Buffer.alloc(44 + samples * 2);
buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVE", 8);
buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index++) {
  const time = index / sampleRate;
  const fade = Math.min(1, time / 0.008) * Math.min(1, (duration - time) / 0.035);
  const envelope = fade * Math.exp(-16 * time);
  const tone = Math.sin(2 * Math.PI * 660 * time) + 0.35 * Math.sin(2 * Math.PI * 990 * time) + 0.12 * Math.sin(2 * Math.PI * 1320 * time);
  buffer.writeInt16LE(Math.round(0.18 * 32767 * envelope * tone), 44 + index * 2);
}
const target = path.resolve(__dirname, "../extension/assets/sounds/expansion.wav");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buffer);
console.log("Generated extension/assets/sounds/expansion.wav");
