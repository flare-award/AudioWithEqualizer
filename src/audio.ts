export const FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;
export const BAND_LABELS = ['60', '170', '310', '600', '1k', '3k', '6k', '12k', '14k', '16k'] as const;
export type Settings = { enabled: boolean; preamp: number; bands: number[]; mono: boolean; balance: number };
export const DEFAULT_SETTINGS: Settings = { enabled: true, preamp: 0, bands: Array(10).fill(0), mono: false, balance: 0 };

export function clampDb(value: number): number { return Math.max(-20, Math.min(20, Number(value) || 0)); }
export function clampPlaybackVolume(value: number): number { return Math.max(0, Math.min(1, Number(value) || 0)); }
export function processingParameters(settings: Settings) {
  return { enabled: settings.enabled, preampGain: Math.pow(10, clampDb(settings.preamp) / 20), filters: FREQUENCIES.map((frequency, i) => ({ frequency, type: 'peaking' as BiquadFilterType, gain: clampDb(settings.bands[i] ?? 0), Q: 1.4 })), balance: Math.max(-1, Math.min(1, settings.balance)), mono: settings.mono };
}

/** Shared processing topology for real-time playback and offline export. */
export function connectProcessing(context: BaseAudioContext, input: AudioNode, output: AudioNode, settings: Settings, realtime = false, playbackVolume = 1) {
  const dry = context.createGain(), wet = context.createGain(), master = context.createGain();
  master.gain.value = clampPlaybackVolume(playbackVolume);
  input.connect(dry); dry.connect(master); master.connect(output);
  const params = processingParameters(settings);
  let node: AudioNode = input;
  const preamp = context.createGain(); preamp.gain.value = params.preampGain; node.connect(preamp); node = preamp;
  const filters = params.filters.map((p) => { const filter = context.createBiquadFilter(); filter.type = p.type; filter.frequency.value = p.frequency; filter.Q.value = p.Q; filter.gain.value = p.gain; node.connect(filter); node = filter; return filter; });
  const panner = context.createStereoPanner(); panner.pan.value = params.balance; node.connect(panner);
  const splitter = context.createChannelSplitter(2), stereo = context.createChannelMerger(2), mono = context.createChannelMerger(2);
  const left = context.createGain(), right = context.createGain(); left.gain.value = .5; right.gain.value = .5;
  const stereoLevel = context.createGain(), monoLevel = context.createGain();
  panner.connect(splitter);
  splitter.connect(stereo, 0, 0); splitter.connect(stereo, 1, 1);
  splitter.connect(left, 0); splitter.connect(right, 1);
  left.connect(mono, 0, 0); left.connect(mono, 0, 1); right.connect(mono, 0, 0); right.connect(mono, 0, 1);
  stereo.connect(stereoLevel); mono.connect(monoLevel); stereoLevel.connect(wet); monoLevel.connect(wet); wet.connect(master);
  stereoLevel.gain.value = settings.mono ? 0 : 1; monoLevel.gain.value = settings.mono ? 1 : 0;
  const setTarget = (param: AudioParam, value: number) => { if (realtime) param.setTargetAtTime(value, context.currentTime, .015); else param.value = value; };
  const update = (next: Settings) => {
    const p = processingParameters(next);
    setTarget(dry.gain, next.enabled ? 0 : 1); setTarget(wet.gain, next.enabled ? 1 : 0);
    setTarget(preamp.gain, p.preampGain); p.filters.forEach((f, i) => setTarget(filters[i].gain, f.gain));
    setTarget(panner.pan, p.balance); setTarget(stereoLevel.gain, next.mono ? 0 : 1); setTarget(monoLevel.gain, next.mono ? 1 : 0);
  };
  const setVolume = (value: number) => setTarget(master.gain, clampPlaybackVolume(value));
  update(settings);
  return { update, setVolume, dry, wet, filters, preamp, panner, master };
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
