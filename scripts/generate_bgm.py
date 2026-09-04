import wave
import struct
import math
import os

os.makedirs('assets/audio', exist_ok=True)

sample_rate = 44100
total_seconds = 32

# Canon in D chord progression with warm acoustic piano / chime harmonics
# D -> A -> Bm -> F#m -> G -> D -> G -> A (repeated)
chords = [
    # root, 3rd, 5th, melody note, octave
    (146.83, 185.00, 220.00, 293.66), # D major
    (110.00, 138.59, 164.81, 220.00), # A major
    (123.47, 146.83, 185.00, 246.94), # B minor
    (92.50,  110.00, 146.83, 185.00), # F# minor
    (98.00,  123.47, 146.83, 196.00), # G major
    (146.83, 185.00, 220.00, 293.66), # D major
    (98.00,  123.47, 146.83, 196.00), # G major
    (110.00, 138.59, 164.81, 220.00), # A major
]

melody_notes = [
    # Measure 1
    (587.33, 0.0, 1.8), (554.37, 2.0, 1.8), # D5, C#5
    (493.88, 4.0, 1.8), (440.00, 6.0, 1.8), # B4, A4
    (392.00, 8.0, 1.8), (369.99, 10.0, 1.8), # G4, F#4
    (392.00, 12.0, 1.8), (440.00, 14.0, 1.8), # G4, A4
    # Measure 2 (higher variation)
    (587.33, 16.0, 0.9), (659.25, 17.0, 0.9), (739.99, 18.0, 1.8), # D5, E5, F#5
    (659.25, 20.0, 0.9), (587.33, 21.0, 0.9), (554.37, 22.0, 1.8), # E5, D5, C#5
    (493.88, 24.0, 0.9), (554.37, 25.0, 0.9), (587.33, 26.0, 1.8), # B4, C#5, D5
    (440.00, 28.0, 0.9), (392.00, 29.0, 0.9), (440.00, 30.0, 2.0), # A4, G4, A4
]

num_samples = sample_rate * total_seconds
audio_buffer = [0.0] * num_samples

def add_tone(freq, start_sec, duration_sec, amplitude=0.35, decay_rate=2.2):
    start_idx = int(start_sec * sample_rate)
    end_idx = min(num_samples, int((start_sec + duration_sec) * sample_rate))
    for i in range(start_idx, end_idx):
        t = (i - start_idx) / sample_rate
        # Envelope: fast attack, exponential decay
        attack = min(1.0, t / 0.015)
        decay = math.exp(-decay_rate * t)
        env = attack * decay
        # Soft harmonics (piano-like warmth)
        harmonic1 = math.sin(2 * math.pi * freq * t)
        harmonic2 = 0.45 * math.sin(2 * math.pi * freq * 2 * t)
        harmonic3 = 0.20 * math.sin(2 * math.pi * freq * 3 * t)
        harmonic4 = 0.08 * math.sin(2 * math.pi * freq * 4 * t)
        val = (harmonic1 + harmonic2 + harmonic3 + harmonic4) * env * amplitude
        audio_buffer[i] += val

# Render chords (each chord lasts 2 seconds, repeats 2 times for 32 seconds)
for loop in range(2):
    loop_offset = loop * 16.0
    for idx, chord in enumerate(chords):
        chord_start = loop_offset + idx * 2.0
        # Arpeggiate chord notes for harp / music box texture
        add_tone(chord[0], chord_start + 0.0, 2.5, amplitude=0.25, decay_rate=1.8)
        add_tone(chord[1], chord_start + 0.25, 2.3, amplitude=0.20, decay_rate=2.0)
        add_tone(chord[2], chord_start + 0.50, 2.1, amplitude=0.22, decay_rate=2.0)
        add_tone(chord[3], chord_start + 0.75, 2.0, amplitude=0.24, decay_rate=2.2)
        add_tone(chord[0] * 2, chord_start + 1.25, 1.8, amplitude=0.18, decay_rate=2.5)

# Render melody
for freq, start, dur in melody_notes:
    add_tone(freq, start, dur, amplitude=0.42, decay_rate=1.9)

# Normalize and write to WAV file
max_val = max(max(abs(x) for x in audio_buffer), 0.001)
scale = 32000.0 / max_val

wav_path = 'assets/audio/wedding-bgm.wav'
mp3_path = 'assets/audio/wedding-bgm.mp3'

with wave.open(wav_path, 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sample_rate)
    frames = bytearray()
    for sample in audio_buffer:
        val = int(sample * scale)
        frames += struct.pack('<h', max(-32768, min(32767, val)))
    wf.writeframes(frames)

# Also copy as .mp3 filename so that either works
import shutil
shutil.copyfile(wav_path, mp3_path)
print(f"BGM created: {wav_path} and {mp3_path} ({total_seconds}s)")
