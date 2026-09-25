/* Musical constants and pitch helpers */
(function (global) {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const INSTRUMENTS = [
    { id: "glock", name: "Glockenspiel", low: 79, high: 108, writtenOff: -24, defaultClef: "treble" },
    { id: "xylo", name: "Xylophone", low: 65, high: 108, writtenOff: -12, defaultClef: "treble" },
    { id: "vibes", name: "Vibraphone", low: 53, high: 89, writtenOff: 0, defaultClef: "treble" },
    { id: "mar43", name: "Marimba 4.3", low: 45, high: 96, writtenOff: 0, defaultClef: "auto" },
    { id: "mar50", name: "Marimba 5.0", low: 36, high: 96, writtenOff: 0, defaultClef: "auto" },
  ];

  const KEYS = [
    { id: "C", name: "C major", vex: "C", tonic: 0, mode: "major", fifths: 0, flats: false },
    { id: "G", name: "G major", vex: "G", tonic: 7, mode: "major", fifths: 1, flats: false },
    { id: "D", name: "D major", vex: "D", tonic: 2, mode: "major", fifths: 2, flats: false },
    { id: "A", name: "A major", vex: "A", tonic: 9, mode: "major", fifths: 3, flats: false },
    { id: "E", name: "E major", vex: "E", tonic: 4, mode: "major", fifths: 4, flats: false },
    { id: "B", name: "B major", vex: "B", tonic: 11, mode: "major", fifths: 5, flats: false },
    { id: "F#", name: "F♯ major", vex: "F#", tonic: 6, mode: "major", fifths: 6, flats: false },
    { id: "F", name: "F major", vex: "F", tonic: 5, mode: "major", fifths: -1, flats: true },
    { id: "Bb", name: "B♭ major", vex: "Bb", tonic: 10, mode: "major", fifths: -2, flats: true },
    { id: "Eb", name: "E♭ major", vex: "Eb", tonic: 3, mode: "major", fifths: -3, flats: true },
    { id: "Ab", name: "A♭ major", vex: "Ab", tonic: 8, mode: "major", fifths: -4, flats: true },
    { id: "Db", name: "D♭ major", vex: "Db", tonic: 1, mode: "major", fifths: -5, flats: true },
    { id: "Am", name: "A minor", vex: "Am", tonic: 9, mode: "harmonic", fifths: 0, flats: false },
    { id: "Em", name: "E minor", vex: "Em", tonic: 4, mode: "harmonic", fifths: 1, flats: false },
    { id: "Bm", name: "B minor", vex: "Bm", tonic: 11, mode: "harmonic", fifths: 2, flats: false },
    { id: "F#m", name: "F♯ minor", vex: "F#m", tonic: 6, mode: "harmonic", fifths: 3, flats: false },
    { id: "C#m", name: "C♯ minor", vex: "C#m", tonic: 1, mode: "harmonic", fifths: 4, flats: false },
    { id: "Dm", name: "D minor", vex: "Dm", tonic: 2, mode: "harmonic", fifths: -1, flats: true },
    { id: "Gm", name: "G minor", vex: "Gm", tonic: 7, mode: "harmonic", fifths: -2, flats: true },
    { id: "Cm", name: "C minor", vex: "Cm", tonic: 0, mode: "harmonic", fifths: -3, flats: true },
    { id: "Fm", name: "F minor", vex: "Fm", tonic: 5, mode: "harmonic", fifths: -4, flats: true },
  ];

  const TIMES = [
    { id: "4/4", num: 4, den: 4, ticks: 16, simple: true, beatTicks: 4 },
    { id: "3/4", num: 3, den: 4, ticks: 12, simple: true, beatTicks: 4 },
    { id: "2/4", num: 2, den: 4, ticks: 8, simple: true, beatTicks: 4 },
    { id: "2/2", num: 2, den: 2, ticks: 16, simple: true, beatTicks: 8 },
    { id: "6/8", num: 6, den: 8, ticks: 12, simple: false, beatTicks: 6 },
    { id: "3/8", num: 3, den: 8, ticks: 6, simple: false, beatTicks: 6 },
    { id: "5/8", num: 5, den: 8, ticks: 10, simple: false, beatTicks: 2 },
    { id: "7/8", num: 7, den: 8, ticks: 14, simple: false, beatTicks: 2 },
  ];

  /* ticks are in sixteenths */
  const DURATIONS = [
    { id: "w", name: "Whole", ticks: 16, vex: "w", restVex: "wr", dots: 0, beamable: false },
    { id: "h", name: "Half", ticks: 8, vex: "h", restVex: "hr", dots: 0, beamable: false },
    { id: "hd", name: "Dotted half", ticks: 12, vex: "hd", restVex: "hdr", dots: 1, beamable: false },
    { id: "q", name: "Quarter", ticks: 4, vex: "q", restVex: "qr", dots: 0, beamable: false },
    { id: "qd", name: "Dotted quarter", ticks: 6, vex: "qd", restVex: "qdr", dots: 1, beamable: false },
    { id: "8", name: "Eighth", ticks: 2, vex: "8", restVex: "8r", dots: 0, beamable: true },
    { id: "8d", name: "Dotted eighth", ticks: 3, vex: "8d", restVex: "8dr", dots: 1, beamable: true },
    { id: "16", name: "Sixteenth", ticks: 1, vex: "16", restVex: "16r", dots: 0, beamable: true },
  ];

  const LEAPS = [
    { id: 2, name: "2nd" },
    { id: 3, name: "3rd" },
    { id: 4, name: "4th" },
    { id: 5, name: "5th" },
    { id: 6, name: "6th" },
    { id: 7, name: "7th" },
    { id: 8, name: "Octave" },
    { id: 9, name: "9th" },
    { id: 12, name: "12th" },
  ];

  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const NAT_MINOR = [0, 2, 3, 5, 7, 8, 10];
  const HAR_MINOR = [0, 2, 3, 5, 7, 8, 11];
  const MEL_MINOR_UP = [0, 2, 3, 5, 7, 9, 11];

  const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const FLAT_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

  function scalePcs(key) {
    const steps =
      key.mode === "major" ? MAJOR :
      key.mode === "natural" ? NAT_MINOR :
      key.mode === "melodic" ? MEL_MINOR_UP :
      HAR_MINOR;
    return steps.map((s) => (key.tonic + s) % 12);
  }

  function midiOctave(midi) {
    return Math.floor(midi / 12) - 1;
  }

  function midiToName(midi, flats) {
    const pc = ((midi % 12) + 12) % 12;
    return (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
  }

  function midiToVexKey(midi, flats) {
    return midiToName(midi, flats) + "/" + midiOctave(midi);
  }

  function letterOf(midi, flats) {
    return midiToName(midi, flats).replace("#", "").replace("b", "");
  }

  /* Prefer spellings that match the key signature. */
  function spellMidi(midi, key) {
    return midiToVexKey(midi, key.flats);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function weightedPick(items, weightFn) {
    let total = 0;
    const weights = items.map((it) => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    if (total <= 0) return pick(items);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function diatonicPitches(key, low, high) {
    const pcs = scalePcs(key);
    const out = [];
    for (let m = low; m <= high; m++) {
      if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
    }
    return out;
  }

  function chromaticPitches(low, high) {
    const out = [];
    for (let m = low; m <= high; m++) out.push(m);
    return out;
  }

  function intervalSemis(nameSteps) {
    /* diatonic "leap size" 2 = 2nd ≈ 1–2 semitones, up to 8 = octave */
    const map = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 12: 19 };
    return map[nameSteps] || 12;
  }

  function nearestIn(list, target) {
    let best = list[0];
    let d = Math.abs(best - target);
    for (const n of list) {
      const dd = Math.abs(n - target);
      if (dd < d) {
        best = n;
        d = dd;
      }
    }
    return best;
  }

  function chordTonesFrom(rootPc, quality) {
    if (quality === "maj") return [0, 4, 7].map((x) => (rootPc + x) % 12);
    if (quality === "min") return [0, 3, 7].map((x) => (rootPc + x) % 12);
    if (quality === "dim") return [0, 3, 6].map((x) => (rootPc + x) % 12);
    if (quality === "maj7") return [0, 4, 7, 11].map((x) => (rootPc + x) % 12);
    if (quality === "min7") return [0, 3, 7, 10].map((x) => (rootPc + x) % 12);
    if (quality === "dom7") return [0, 4, 7, 10].map((x) => (rootPc + x) % 12);
    return [0, 4, 7].map((x) => (rootPc + x) % 12);
  }

  function diatonicQualities(key) {
    if (key.mode === "major") {
      return [
        { deg: 0, q: "maj" },
        { deg: 1, q: "min" },
        { deg: 2, q: "min" },
        { deg: 3, q: "maj" },
        { deg: 4, q: "maj" },
        { deg: 5, q: "min" },
        { deg: 6, q: "dim" },
      ];
    }
    return [
      { deg: 0, q: "min" },
      { deg: 1, q: "dim" },
      { deg: 2, q: "maj" },
      { deg: 3, q: "min" },
      { deg: 4, q: "maj" },
      { deg: 5, q: "maj" },
      { deg: 6, q: "dim" },
    ];
  }

  /* Fewest accidentals first. Same count: flats before sharps, major before its relative minor. */
  function circleRank(key) {
    const n = Math.abs(key.fifths || 0);
    const sharp = key.fifths > 0 ? 1 : 0;
    const minor = key.id.endsWith("m") ? 1 : 0;
    return n * 4 + sharp * 2 + minor;
  }

  global.Theory = {
    INSTRUMENTS,
    KEYS,
    TIMES,
    DURATIONS,
    LEAPS,
    scalePcs,
    midiOctave,
    midiToName,
    midiToVexKey,
    spellMidi,
    clamp,
    randInt,
    pick,
    circleRank,
    weightedPick,
    diatonicPitches,
    chromaticPitches,
    intervalSemis,
    nearestIn,
    chordTonesFrom,
    diatonicQualities,
    PC,
    writtenOff: function (instrumentId) {
      const inst = INSTRUMENTS.find((i) => i.id === instrumentId);
      return inst && inst.writtenOff ? inst.writtenOff : 0;
    },
  };
})(window);
