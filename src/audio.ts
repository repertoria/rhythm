// Sounds are scheduled up front on the audio clock: a pattern is finite and
// known in advance, so there's no need for a lookahead scheduler.

export type Sound = 'accent' | 'beat' | 'note'

export interface Cue {
  /** seconds after start */
  time: number
  sound: Sound
  gain?: number
}

let ctx: AudioContext | null = null
let out: GainNode | null = null
let buffers: Record<Sound, AudioBuffer>

/** Must be called from a user gesture the first time (autoplay policy). */
function context(): AudioContext {
  if (!ctx) {
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    ctx = new AudioContext({ latencyHint: 'interactive' })
    buffers = makeSounds(ctx)
  }
  if (ctx.state !== 'running') void ctx.resume()
  return ctx
}

/** Schedules the cues and returns the audio-clock time they're relative to. */
export function play(cues: Cue[]): number {
  stop()
  const c = context()
  out = c.createGain()
  out.connect(c.destination)
  const t0 = c.currentTime + 0.15
  for (const cue of cues) {
    const src = c.createBufferSource()
    src.buffer = buffers[cue.sound]
    if (cue.gain !== undefined && cue.gain !== 1) {
      const g = c.createGain()
      g.gain.value = cue.gain
      src.connect(g).connect(out)
    } else src.connect(out)
    src.start(t0 + cue.time)
  }
  return t0
}

/** Disconnecting the output silences everything already scheduled. */
export function stop() {
  out?.disconnect()
  out = null
}

/** Audio-clock time of the sound reaching the speaker at performance time `p` (ms), e.g. an event's timeStamp. */
export function heardAt(p = performance.now()): number {
  if (!ctx) return 0
  const ts = ctx.getOutputTimestamp?.()
  if (ts?.contextTime && ts.performanceTime) return ts.contextTime + (p - ts.performanceTime) / 1000
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - (performance.now() - p) / 1000
}

function makeSounds(c: AudioContext): Record<Sound, AudioBuffer> {
  const sr = c.sampleRate
  const shape = (x: number) => Math.tanh(1.6 * x) / Math.tanh(1.6)
  const voice = (freq: number, gain: number, decay: number, noise = 0) => {
    const len = Math.floor(sr * 0.08)
    const buf = c.createBuffer(1, len, sr)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      const t = i / sr
      const env = Math.min(1, t * 3000) * Math.exp(-t * decay)
      const tone = 0.75 * Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 2.01 * t)
      const hiss = noise * (Math.random() * 2 - 1) * Math.exp(-t * decay * 3)
      d[i] = shape(gain * env * (tone + hiss))
    }
    return buf
  }
  return {
    accent: voice(1900, 0.9, 60),
    beat: voice(1250, 0.7, 75),
    note: voice(640, 1, 38, 0.6),
  }
}
