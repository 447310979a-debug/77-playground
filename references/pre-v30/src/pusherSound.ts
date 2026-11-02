/** Metallic strikes, tray rattles and little rebounds, unlocked only by a player gesture. */
export function createPusherSound() {
  let context: AudioContext | undefined;
  let output: GainNode;
  let noise: AudioBuffer;
  const voices = new Set<AudioScheduledSourceNode>();
  function track(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, duration: number) {
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
    source.start(start); source.stop(start + duration);
  }
  return {
    unlock() {
      try {
        if (!context) {
          context = new AudioContext();
          output = context.createGain(); output.gain.value = .55;
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -14; limiter.knee.value = 8; limiter.ratio.value = 8;
          limiter.attack.value = .002; limiter.release.value = .12;
          output.connect(limiter); limiter.connect(context.destination);
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * .12), context.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * .2));
        }
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* The game still works when Web Audio is unavailable. */ }
    },
    resume() { if (context?.state === 'suspended') void context.resume().catch(() => {}); },
    impact(count: number) {
      if (!context || context.state !== 'running' || !Number.isFinite(count)) return;
      for (let coin = 0; coin < Math.min(count, 6); coin++) {
        for (let bounce = 0; bounce < 3; bounce++) {
          if (voices.size > 44) return;
          const start = context.currentTime + coin * (.02 + Math.random() * .035) + bounce * (.065 + Math.random() * .035);
          const volume = .045 * Math.pow(.48, bounce) * (.7 + Math.random() * .3);
          const pitch = 1350 + Math.random() * 900;
          const pan = context.createStereoPanner(); pan.pan.value = (Math.random() - .5) * .8; pan.connect(output);
          const gain = context.createGain(); gain.gain.setValueAtTime(.0001, start);
          gain.gain.linearRampToValueAtTime(volume, start + .002);
          gain.gain.exponentialRampToValueAtTime(.0001, start + .16); gain.connect(pan);
          for (const ratio of [1, 1.47, 2.13]) {
            const tone = context.createOscillator(); tone.frequency.value = pitch * ratio;
            tone.connect(gain); track(tone, [], start, .18);
          }
          const scrape = context.createBufferSource(); scrape.buffer = noise;
          const filter = context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1800;
          scrape.connect(filter); filter.connect(gain);
          track(scrape, [filter, gain, pan], start, .19);
        }
      }
    },
    stop() {
      for (const voice of voices) { try { voice.stop(); } catch { /* Already stopped. */ } }
      voices.clear();
      if (context?.state === 'running') void context.suspend().catch(() => {});
    },
    close() { this.stop(); if (context) void context.close().catch(() => {}); context = undefined; },
  };
}
