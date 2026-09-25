/* Web Audio metronome + etude playback. Lookahead scheduler, no setInterval drift. */
(function (global) {
  let ctx = null;
  let metroOn = false;
  let playing = false;
  let timerId = null;
  let nextNoteTime = 0;
  let beat = 0;
  let subBeat = 0;
  let tempo = 80;
  let beatsPerBar = 4;
  let subdiv = 1;
  let onBeat = null;
  let playEvents = null;
  let playIndex = 0;
  let playNextTime = 0;
  let onPlayDone = null;
  let playToken = 0;
  let playOwnsClick = false;
  let clickList = [];
  let cueList = [];
  let playEnd = 0;
  let clicksEnabled = true;

  const LOOKAHEAD = 0.025;
  const SCHEDULE_AHEAD = 0.12;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function noiseBuffer(c, seconds) {
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  let clickBuf = null;
  function getClickBuf(c) {
    if (!clickBuf) clickBuf = noiseBuffer(c, 0.04);
    return clickBuf;
  }

  function scheduleClick(time, accent, sub) {
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = getClickBuf(c);
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = accent ? 4 : 2.2;
    filter.frequency.value = accent ? 2200 : sub ? 700 : 1100;
    const g = c.createGain();
    const peak = accent ? 0.42 : sub ? 0.08 : 0.22;
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0008, time + (accent ? 0.06 : 0.035));
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(time);
    src.stop(time + 0.07);

    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1600 : sub ? 650 : 1000;
    og.gain.setValueAtTime(accent ? 0.12 : sub ? 0.03 : 0.06, time);
    og.gain.exponentialRampToValueAtTime(0.0008, time + 0.025);
    osc.connect(og);
    og.connect(c.destination);
    osc.start(time);
    osc.stop(time + 0.03);
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  const NOTE_MIDI = {
    C2: 36, G2: 43, C3: 48, G3: 55, C4: 60, G4: 67,
    C5: 72, G5: 79, C6: 84, G6: 91, C7: 96, G7: 103, C8: 108,
  };
  const SAMPLE_DIR = {
    glock: "glockenspiel",
    xylo: "xylophone",
    vibes: "vibraphone",
    mar43: "marimba",
    mar50: "marimba",
  };
  const sampleBank = {};

  function sampleFolder(id) {
    return SAMPLE_DIR[id] || "marimba";
  }

  function loadInstrument(instId) {
    const folder = sampleFolder(instId);
    if (Array.isArray(sampleBank[folder])) return Promise.resolve(sampleBank[folder]);
    if (sampleBank[folder]) return sampleBank[folder];
    const c = ac();
    const p = Promise.all(
      Object.keys(NOTE_MIDI).map((name) =>
        fetch("./sample-" + folder + "-" + name + ".mp3")
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((arr) => (arr ? c.decodeAudioData(arr.slice(0)) : null))
          .then((buf) => (buf ? { midi: NOTE_MIDI[name], buffer: buf } : null))
          .catch(() => null)
      )
    ).then((list) => {
      const ready = list.filter(Boolean).sort((a, b) => a.midi - b.midi);
      sampleBank[folder] = ready;
      return ready;
    });
    sampleBank[folder] = p;
    return p;
  }

  function playSample(time, midi, instId) {
    const folder = sampleFolder(instId);
    const list = sampleBank[folder];
    if (!Array.isArray(list) || !list.length) return false;
    if (!list || !list.length) return false;
    let best = list[0];
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i].midi - midi) < Math.abs(best.midi - midi)) best = list[i];
    }
    const c = ac();
    if (time < c.currentTime) time = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = best.buffer;
    src.playbackRate.value = midiToFreq(midi) / midiToFreq(best.midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0.75, time);
    src.connect(g);
    g.connect(scoreOut());
    src.start(time);
    trackNode(src);
    return true;
  }

  const MALLET_VOICE = {
    glock: { decay: 1.8, brightness: 1.6, hardness: 0.28, ratios: [1, 2.76, 5.4, 8.93], gains: [1, 0.35, 0.16, 0.08] },
    xylo: { decay: 0.38, brightness: 1.35, hardness: 0.34, ratios: [1, 3.15, 6.3, 10.2], gains: [1, 0.28, 0.12, 0.05] },
    vibes: { decay: 2.4, brightness: 0.85, hardness: 0.12, ratios: [1, 3.98, 9.2], gains: [1, 0.22, 0.07] },
    mar43: { decay: 1.15, brightness: 0.95, hardness: 0.16, ratios: [1, 3.95, 10.7], gains: [1, 0.2, 0.06] },
    mar50: { decay: 1.25, brightness: 0.9, hardness: 0.15, ratios: [1, 3.95, 10.7], gains: [1, 0.18, 0.05] },
  };

  let master = null;
  let playBus = null;
  let liveNodes = [];

  function out() {
    const c = ac();
    if (!master) {
      master = c.createGain();
      master.gain.value = 0.7;
      master.connect(c.destination);
    }
    return master;
  }

  function scoreOut() {
    const c = ac();
    if (!playBus) {
      playBus = c.createGain();
      playBus.gain.value = 0.85;
      playBus.connect(out());
    }
    return playBus;
  }

  function trackNode(node) {
    liveNodes.push(node);
    try {
      node.onended = function () {
        liveNodes = liveNodes.filter((n) => n !== node);
      };
    } catch (e) {}
  }

  function cutScoreAudio() {
    const c = ctx || ac();
    const now = c.currentTime;
    liveNodes.forEach((n) => {
      try { n.stop(now); } catch (e) {}
    });
    liveNodes = [];
    if (playBus) {
      try {
        playBus.gain.cancelScheduledValues(now);
        playBus.gain.setValueAtTime(0, now);
      } catch (e) {}
      playBus = c.createGain();
      playBus.gain.value = 0.85;
      playBus.connect(out());
    }
  }

  function scheduleNote(time, midi, durSec, instId) {
    const c = ac();
    if (time < c.currentTime) time = c.currentTime;
    const spec = MALLET_VOICE[instId] || MALLET_VOICE.mar50;
    const f0 = midiToFreq(midi);
    const low = midi < 55;
    const decay = spec.decay * (low ? 1.45 : midi > 84 ? 0.7 : 1) * Math.max(0.55, Math.min(1.2, durSec / 0.4));
    const dest = scoreOut();

    const strike = c.createBufferSource();
    strike.buffer = getClickBuf(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.min(8000, f0 * spec.brightness * 3.2);
    bp.Q.value = 1.4;
    const sg = c.createGain();
    sg.gain.setValueAtTime(spec.hardness, time);
    sg.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    strike.connect(bp);
    bp.connect(sg);
    sg.connect(dest);
    strike.start(time);
    strike.stop(time + 0.04);
    trackNode(strike);

    if (playSample(time, midi, instId)) return;

    spec.ratios.forEach((ratio, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f0 * ratio;
      const amp = 0.22 * spec.gains[i] / Math.sqrt(spec.ratios.length);
      const life = decay * (i === 0 ? 1 : 0.45 / ratio);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, life));
      o.connect(g);
      g.connect(dest);
      o.start(time);
      o.stop(time + life + 0.03);
      trackNode(o);
    });
  }

  function quarterTicks() {
    return (global.Theory && global.Theory.TICKS && global.Theory.TICKS.quarter) || 24;
  }

  function secondsPerPulse() {
    return 60 / (tempo * subdiv);
  }

  function scheduler() {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (playOwnsClick) {
      while (clickList.length && clickList[0].time < now + SCHEDULE_AHEAD) {
        const tick = clickList.shift();
        if (clicksEnabled) scheduleClick(tick.time, tick.accent, tick.sub);
      }
      while (cueList.length && cueList[0].time < now + SCHEDULE_AHEAD) {
        const cue = cueList.shift();
        const wait = Math.max(0, (cue.time - now) * 1000);
        const token = cue.token;
        setTimeout(() => {
          if (token === playToken && playing) cue.fn();
        }, wait);
      }
      if (!clickList.length && !cueList.length && now > playEnd) {
        playing = false;
        playOwnsClick = false;
        const cb = onPlayDone;
        onPlayDone = null;
        stopClockIfIdle();
        if (cb) cb();
      }
      return;
    }
    while (metroOn && nextNoteTime < now + SCHEDULE_AHEAD) {
      const isDown = subBeat === 0;
      const accent = isDown && beat === 0;
      scheduleClick(nextNoteTime, accent, !isDown);
      if (isDown && onBeat) {
        const captured = beat;
        const wait = Math.max(0, (nextNoteTime - now) * 1000);
        setTimeout(() => {
          if (metroOn && onBeat) onBeat(captured, beatsPerBar, true);
        }, wait);
      }
      nextNoteTime += secondsPerPulse();
      subBeat = (subBeat + 1) % subdiv;
      if (subBeat === 0) beat = (beat + 1) % beatsPerBar;
    }

    while (playing && playEvents && playIndex < playEvents.length && playNextTime < now + SCHEDULE_AHEAD) {
      const ev = playEvents[playIndex++];
      const dur = (ev.dur.ticks / quarterTicks()) * (60 / tempo);
      if (!ev.rest && ev.pitches && ev.pitches.length) {
        ev.pitches.forEach((p) => scheduleNote(playNextTime, p, dur));
      }
      playNextTime += dur;
    }
    if (playing && playEvents && playIndex >= playEvents.length && playNextTime < now) {
      playing = false;
      if (onPlayDone) onPlayDone();
    }
  }

  function startClock() {
    if (timerId) return;
    ac();
    timerId = setInterval(scheduler, LOOKAHEAD * 1000);
  }

  function stopClockIfIdle() {
    if (!metroOn && !playing && timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startMetronome(bpm, beats, opts) {
    opts = opts || {};
    ac();
    tempo = bpm || 80;
    beatsPerBar = Math.max(1, beats || 4);
    subdiv = opts.subdiv === 2 ? 2 : opts.subdiv === 4 ? 4 : 1;
    onBeat = opts.onBeat || null;
    beat = 0;
    subBeat = 0;
    metroOn = true;
    nextNoteTime = ctx.currentTime + 0.05;
    startClock();
    if (onBeat) onBeat(0, beatsPerBar, false);
  }

  function stopMetronome() {
    metroOn = false;
    onBeat = null;
    stopClockIfIdle();
  }

  function setTempo(bpm) {
    tempo = Math.max(30, Math.min(240, bpm || tempo));
  }

  function setSubdiv(n) {
    subdiv = n === 2 || n === 4 ? n : 1;
    subBeat = 0;
  }

  let playEndTimer = null;

  function playAlong(score, opts) {
    stopPlayback();
    opts = opts || {};
    const token = playToken;
    const c = ac();
    const quarterBpm = Number(opts.quarterBpm) || tempo || 80;
    const clickBpm = Number(opts.clickBpm) || quarterBpm;
    const beats = Math.max(1, opts.beatsPerBar || 4);
    const countIn = Math.max(0, opts.countIn | 0);
    const onCue = opts.onCue || null;
    onPlayDone = opts.done || null;
    clicksEnabled = true;
    const instId = (score && score.settingsSnapshot && score.settingsSnapshot.instrument) || "mar50";
    const qTicks = quarterTicks();
    const beatSec = 60 / clickBpm;
    const qSec = 60 / quarterBpm;

    const kick = () => {
      if (token !== playToken) return;
      if (!score || !score.measures) {
        const cb = onPlayDone;
        onPlayDone = null;
        if (cb) cb();
        return;
      }
      const items = [];
      let tickPos = 0;
      score.measures.forEach((m) => {
        (m.events || []).forEach((ev) => {
          items.push({ ev: ev, tick: tickPos });
          tickPos += ev.dur && ev.dur.ticks ? ev.dur.ticks : qTicks;
        });
      });
      const musicSec = (tickPos / qTicks) * qSec;
      const musicClicks = Math.max(1, Math.round(musicSec / beatSec));
      const t0 = c.currentTime + 0.07;
      const countBeats = countIn * beats;
      const musicAt = t0 + countBeats * beatSec;
      items.forEach((item) => {
        const ev = item.ev;
        const when = musicAt + (item.tick / qTicks) * qSec;
        const dur = Math.max(0.05, ((ev.dur && ev.dur.ticks ? ev.dur.ticks : qTicks) / qTicks) * qSec);
        if (!ev.rest && ev.pitches && ev.pitches.length) {
          ev.pitches.forEach((p) => {
            try { scheduleNote(when, p, dur, instId); } catch (err) {}
          });
        }
      });
      clickList = [];
      cueList = [];
      const steps = subdiv === 2 || subdiv === 4 ? subdiv : 1;
      const total = countBeats + musicClicks;
      for (let i = 0; i < total; i++) {
        const time = t0 + i * beatSec;
        const inCount = i < countBeats;
        const beat = inCount ? i % beats : (i - countBeats) % beats;
        clickList.push({ time: time, accent: beat === 0, sub: false });
        for (let s = 1; s < steps; s++) {
          clickList.push({ time: time + (beatSec * s) / steps, accent: false, sub: true });
        }
        clickList.sort((a, b) => a.time - b.time);
        cueList.push({
          time: time,
          token: token,
          fn: () => {
            if (onCue) {
              onCue({
                phase: inCount ? "countin" : "play",
                beat: inCount ? beat : i - countBeats,
                beats: beats,
                musicBeats: musicClicks,
              });
            }
          },
        });
      }
      playEnd = musicAt + musicSec + 0.08;
      playing = true;
      playOwnsClick = true;
      startClock();
    };

    const go = () => {
      loadInstrument(instId).then(() => { if (token === playToken) kick(); }).catch(() => { if (token === playToken) kick(); });
    };
    if (c.state === "running") go();
    else c.resume().then(go).catch(go);
  }

  function setClicks(on) {
    clicksEnabled = !!on;
  }

  function playScore(score, bpm, done) {
    playAlong(score, { quarterBpm: bpm, clickBpm: bpm, beatsPerBar: 4, countIn: 0, done: done });
  }

  function stopPlayback() {
    playToken++;
    playing = false;
    playOwnsClick = false;
    clickList = [];
    cueList = [];
    playEvents = null;
    playIndex = 0;
    if (playEndTimer) {
      clearTimeout(playEndTimer);
      playEndTimer = null;
    }
    onPlayDone = null;
    cutScoreAudio();
    stopClockIfIdle();
  }

  function isPlaying() {
    return playing;
  }
  function isMetro() {
    return metroOn;
  }

  global.AudioEngine = {
    startMetronome,
    stopMetronome,
    setTempo,
    setSubdiv,
    playScore,
    playAlong,
    setClicks,
    stopPlayback,
    isPlaying,
    isMetro,
    ac,
  };
})(window);
