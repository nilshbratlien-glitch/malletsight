/* Sight-reading generator for 2 / 3 / 4 mallet keyboard percussion */
(function (global) {
  const T = global.Theory;

  function durById(id) {
    return T.DURATIONS.find((d) => d.id === id);
  }

  function spanOf(d) {
    return d.ticks * (d.group || 1);
  }

  function emitRhythm(events, choice, rest) {
    const n = choice.group || 1;
    if (n > 1 && rest) {
      const ticks = choice.ticks * n;
      const plain = durById(
        (T.DURATIONS.find((d) => !d.group && d.ticks === ticks) || {}).id
      );
      events.push({ dur: plain || { ticks: ticks, dots: 0, beamable: false }, rest: true });
      return ticks;
    }
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        events.push({
          dur: choice,
          rest: rest,
          tuplet: i === 0 ? "start" : i === n - 1 ? "end" : "mid",
        });
      }
      return choice.ticks * n;
    }
    events.push({ dur: choice, rest: rest });
    return choice.ticks;
  }

  function buildRhythm(settings, ticks, beatTicks) {
    let allowed = settings.rhythms.map(durById).filter(Boolean);
    const restAllowed = settings.rests
      .map(durById)
      .filter((d) => d && !d.group);
    const events = [];
    let left = ticks;
    let lastWasRest = false;
    const beat = beatTicks || T.TICKS.quarter;
    const restChance =
      settings.mallets >= 3 && settings.texture !== "melody" && settings.texture !== "mixed"
        ? settings.allowRests ? 0.08 : 0
        : settings.allowRests ? 0.18 : 0;
    const density = settings.rhythmDensity;
    const q = T.TICKS.quarter;

    while (left > 0) {
      const pos = ticks - left;
      const toBeat = beat - (pos % beat);
      const cap = pos % beat === 0 ? left : toBeat;
      const noteFits = allowed.filter((d) => spanOf(d) <= cap);
      const restFits = restAllowed.filter((d) => spanOf(d) <= cap);
      const useRest =
        settings.allowRests &&
        restFits.length &&
        !lastWasRest &&
        events.length > 0 &&
        pos !== 0 &&
        Math.random() < restChance;

      let pool = useRest ? restFits : noteFits.length ? noteFits : restFits;
      if (!pool.length) {
        const fallback = [durById("8"), durById("16"), durById("32")].filter((d) => d && d.ticks <= cap && d.ticks <= left);
        const unit = fallback[0];
        if (!unit) break;
        left -= emitRhythm(events, unit, true);
        lastWasRest = true;
        continue;
      }

      const onBeat = pos % beat === 0;
      const choice = T.weightedPick(pool, (d) => {
        const shortBias = density / 5;
        const longBias = 1 - shortBias;
        const span = spanOf(d);
        let s = longBias * span + shortBias * (T.TICKS.whole + 1 - span) + (d.id === "q" ? q : 0);
        if (onBeat && (d.id === "q" || d.id === "h")) s += q;
        if (!onBeat && span >= T.TICKS.half) s *= 0.2;
        return s;
      });

      left -= emitRhythm(events, choice, useRest);
      lastWasRest = useRest;
    }
    return events;
  }

  function durByTicks(ticks) {
    return T.DURATIONS.find((d) => !d.group && d.ticks === ticks) || null;
  }

  function syncWindow(beat) {
    if (beat >= 36) return beat;
    if (beat <= 12) return 36;
    return beat * 2;
  }

  /* One offbeat note that holds across the next pulse. The rest of the bar stays. */
  function syncFigures(win, allowRests) {
    const eighth = durByTicks(12);
    const quarter = durByTicks(24);
    const dotted = durByTicks(36);
    const figs = [];
    if (win === 48 && eighth && dotted) {
      figs.push({ w: 6, notes: [{ dur: eighth, rest: false }, { dur: dotted, rest: false }] });
      if (allowRests) figs.push({ w: 2, notes: [{ dur: eighth, rest: true }, { dur: dotted, rest: false }] });
    }
    if (win === 48 && eighth && quarter) {
      figs.push({
        w: 2,
        notes: [
          { dur: eighth, rest: false },
          { dur: quarter, rest: false },
          { dur: eighth, rest: false },
        ],
      });
    }
    if (win === 36 && eighth && quarter) {
      figs.push({ w: 5, notes: [{ dur: eighth, rest: false }, { dur: quarter, rest: false }] });
      if (allowRests) figs.push({ w: 2, notes: [{ dur: eighth, rest: true }, { dur: quarter, rest: false }] });
    }
    return figs;
  }

  function copyRhythm(ev, ticks) {
    const dur = ticks == null ? ev.dur : durByTicks(ticks);
    if (!dur) return null;
    return {
      dur: dur,
      rest: !!ev.rest,
      tuplet: ticks == null ? ev.tuplet || null : null,
    };
  }

  function cutAround(events, start, end) {
    let t = 0;
    const before = [];
    const after = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const a = t;
      const b = t + ev.dur.ticks;
      t = b;
      if (b <= start) {
        before.push(copyRhythm(ev));
        continue;
      }
      if (a >= end) {
        after.push(copyRhythm(ev));
        continue;
      }
      if (ev.tuplet) return null;
      if (a < start) {
        const left = copyRhythm(ev, start - a);
        if (!left) return null;
        before.push(left);
      }
      if (b > end) {
        const right = copyRhythm(ev, b - end);
        if (!right) return null;
        after.push(right);
      }
    }
    return { before: before, after: after };
  }

  function applySyncopation(events, ticks, beat, settings) {
    if (!settings.syncopation || !events.length || !beat) return events;
    const win = syncWindow(beat);
    const figs = syncFigures(win, !!settings.allowRests);
    if (!win || !figs.length || ticks < win) return events;
    const starts = [];
    for (let pos = 0; pos + win <= ticks; pos += beat) starts.push(pos);
    const order = starts.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < order.length; i++) {
      const cut = cutAround(events, order[i], order[i] + win);
      if (!cut) continue;
      const fig = T.weightedPick(figs, (f) => f.w);
      const mid = fig.notes.map((n) => ({ dur: n.dur, rest: n.rest, tuplet: null }));
      const out = cut.before.concat(mid, cut.after);
      const used = out.reduce((s, e) => s + e.dur.ticks, 0);
      if (used === ticks) return out;
    }
    return events;
  }

  function colorTop(pitches, settings, key, cell) {
    if (!settings.accidentals || (cell && cell.cadence) || !pitches || !pitches.length) return pitches;
    if (Math.random() > 0.22) return pitches;
    const pcs = T.scalePcs(key);
    const topAt = pitches.length - 1;
    const top = pitches[topAt];
    const opts = [top - 1, top + 1].filter((p) => {
      const pc = ((p % 12) + 12) % 12;
      return p >= settings.rangeLow && p <= settings.rangeHigh && pcs.indexOf(pc) < 0 && pitches.indexOf(p) < 0;
    });
    if (!opts.length) return pitches;
    const next = pitches.slice();
    next[topAt] = T.pick(opts);
    next.sort((a, b) => a - b);
    return next;
  }

  function pitchPool(settings, key) {
    const diat = T.diatonicPitches(key, settings.rangeLow, settings.rangeHigh);
    if (!settings.accidentals) return diat;
    /* Mix a few chromatics into the pool, still prefer diatonic. */
    return diat;
  }

  function nextMelodyPitch(prev, pool, settings, key) {
    if (!pool.length) return settings.rangeLow;
    const maxSemi = T.intervalSemis(settings.maxLeap);
    if (prev == null) {
      if (settings.startTonic) {
        const tonics = pool.filter((p) => p % 12 === key.tonic);
        return tonics.length ? T.pick(tonics) : T.nearestIn(pool, (settings.rangeLow + settings.rangeHigh) / 2);
      }
      const mid = pool.filter((p) => Math.abs(p - (settings.rangeLow + settings.rangeHigh) / 2) < 8);
      return T.pick(mid.length ? mid : pool);
    }
    const candidates = pool.filter((p) => Math.abs(p - prev) <= maxSemi && p !== prev);
    const withUnison = settings.allowUnison ? pool.filter((p) => Math.abs(p - prev) <= maxSemi) : candidates;
    const use = withUnison.length ? withUnison : pool.filter((p) => Math.abs(p - prev) <= maxSemi + 2);
    if (!use.length) return T.nearestIn(pool, prev);
    return T.weightedPick(use, (p) => {
      const dist = Math.abs(p - prev);
      if (dist === 1 || dist === 2) return 8;
      if (dist === 3 || dist === 4) return 4;
      if (dist === 0) return 1.2;
      if (dist <= 7) return 2;
      return 0.6;
    });
  }

  function createMelodyWalker(settings, key, pool) {
    const pcs = T.scalePcs(key);
    const tonic = key.tonic;
    const maxSemi = T.intervalSemis(settings.maxLeap);
    const lo = pool[0];
    const hi = pool[pool.length - 1];
    let prev = null;
    let prevWasChromatic = false;
    let dir = Math.random() < 0.5 ? 1 : -1;
    let stepsLeft = 3 + ((Math.random() * 2) | 0);
    let leapDebt = false;
    let phraseLeft = 6 + ((Math.random() * 3) | 0);
    let repeated = false;

    function pcOf(p) {
      return ((p % 12) + 12) % 12;
    }
    function degOf(p) {
      const i = pcs.indexOf(pcOf(p));
      return i < 0 ? -1 : i;
    }
    function nearestTonic(from) {
      const tonics = pool.filter((p) => pcOf(p) === tonic);
      return tonics.length ? T.nearestIn(tonics, from) : T.nearestIn(pool, from);
    }
    function nearestApproach(from) {
      const approaches = pool.filter((p) => {
        const d = (pcOf(p) - tonic + 12) % 12;
        return d === 2 || d === 11 || d === 7;
      });
      return approaches.length ? T.nearestIn(approaches, from) : from;
    }
    function inScale(p) {
      return pcs.indexOf(pcOf(p)) >= 0;
    }
    function indexOfPitch(p) {
      const exact = pool.indexOf(p);
      if (exact >= 0) return exact;
      let best = 0;
      let dist = 99;
      pool.forEach((n, i) => {
        const d = Math.abs(n - p);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      return best;
    }
    function scaleSteps(from, steps) {
      if (!steps) return from;
      const j = indexOfPitch(from) + steps;
      if (j < 0 || j >= pool.length) return null;
      const p = pool[j];
      if (Math.abs(p - from) > maxSemi) return null;
      return p;
    }
    function chromaticBeside(pitch, from) {
      const opts = [];
      [pitch - 1, pitch + 1].forEach((p) => {
        if (p < settings.rangeLow || p > settings.rangeHigh) return;
        if (inScale(p)) return;
        if (from != null && Math.abs(p - from) > maxSemi) return;
        opts.push(p);
      });
      if (!opts.length) return pitch;
      const steps = from == null ? opts : opts.filter((p) => Math.abs(p - from) <= 2);
      return (steps.length ? steps : opts)[0];
    }
    function turn() {
      dir *= -1;
      stepsLeft = 3 + ((Math.random() * 2) | 0);
    }
    function finish(pitch, from) {
      const leap = from != null && Math.abs(pitch - from) >= 5;
      leapDebt = leap;
      if (leap) dir = Math.sign(pitch - from) || dir;
      prev = pitch;
      repeated = from != null && pitch === from;
      if (!leapDebt && !repeated && settings.accidentals && phraseLeft > 2 && Math.random() < 0.16) {
        const chrom = chromaticBeside(pitch, from);
        if (chrom !== pitch) {
          prev = chrom;
          prevWasChromatic = true;
          leapDebt = false;
        }
      }
      return prev;
    }

    return function next(kind) {
      if (prev == null) {
        prev = settings.startTonic
          ? nearestTonic((settings.rangeLow + settings.rangeHigh) / 2)
          : T.nearestIn(pool, (settings.rangeLow + settings.rangeHigh) / 2);
        prevWasChromatic = false;
        return prev;
      }
      if (kind === "tonic") {
        prev = nearestTonic(prev);
        prevWasChromatic = false;
        leapDebt = false;
        return prev;
      }
      if (kind === "approach") {
        prev = nearestApproach(prev);
        prevWasChromatic = false;
        leapDebt = false;
        return prev;
      }
      const from = prev;
      if (prevWasChromatic) {
        prevWasChromatic = false;
        const back = scaleSteps(from, -dir) || scaleSteps(from, dir) || nearestTonic(from);
        prev = back;
        leapDebt = false;
        return prev;
      }
      if (leapDebt) {
        const back = scaleSteps(from, -dir) || scaleSteps(from, dir);
        leapDebt = false;
        if (back && back !== from) return finish(back, from);
      }
      phraseLeft--;
      if (phraseLeft <= 1) {
        const goal = nearestTonic(from);
        if (pcOf(from) === tonic || phraseLeft < 0) {
          phraseLeft = 6 + ((Math.random() * 3) | 0);
          dir = Math.random() < 0.5 ? 1 : -1;
          stepsLeft = 3;
        } else {
          const toward = Math.sign(goal - from) || -dir;
          const step = scaleSteps(from, toward) || goal;
          dir = toward;
          return finish(step, from);
        }
      }
      stepsLeft--;
      if (stepsLeft <= 0 || from <= lo + 2 || from >= hi - 2) turn();
      let pitch = null;
      const roll = Math.random();
      if (!repeated && roll < 0.08) pitch = from;
      else if (roll < 0.8) pitch = scaleSteps(from, dir);
      else if (roll < 0.93) pitch = scaleSteps(from, dir * 2);
      else if (kind === "beat" && maxSemi >= 5) {
        const leap = maxSemi >= 12 ? 7 : maxSemi >= 9 ? 5 : maxSemi >= 7 ? 4 : 3;
        pitch = scaleSteps(from, dir * leap);
      }
      if (pitch == null) {
        turn();
        pitch = scaleSteps(from, dir) || scaleSteps(from, -dir) || from;
      }
      if (kind === "beat") {
        const step = scaleSteps(from, dir);
        if (step != null && [0, 2, 4].indexOf(degOf(step)) >= 0) pitch = step;
      }
      return finish(pitch, from);
    };
  }

  function handSpanOk(a, b, minS, maxS) {
    const d = Math.abs(b - a);
    return d >= minS && d <= maxS;
  }

  function twoStaff(settings) {
    return (
      String(settings.instrumentId || "").indexOf("mar") === 0 &&
      settings.mallets >= 3 &&
      settings.rangeLow < 55 &&
      settings.rangeHigh >= 64
    );
  }

  function playable(chord, nNotes, settings) {
    if (!chord || chord.length !== nNotes) return false;
    const span = chord[chord.length - 1] - chord[0];
    const wide = twoStaff(settings);
    if (span > (wide ? 31 : 19)) return false;
    const maxS = Math.min(settings.handSpanMax || 12, 12);
    if (nNotes === 2) return wide || handSpanOk(chord[0], chord[1], 3, maxS);
    if (nNotes === 3) {
      return handSpanOk(chord[0], chord[1], 3, maxS) || handSpanOk(chord[1], chord[2], 3, maxS);
    }
    const hands =
      handSpanOk(chord[0], chord[1], 3, maxS) && handSpanOk(chord[2], chord[3], 3, maxS);
    if (wide) return hands;
    return (
      hands &&
      chord[2] - chord[1] >= 1 &&
      chord[2] - chord[1] <= Math.min(settings.innerGapMax || 12, 12)
    );
  }

  function stackClosed(available, bass, nNotes) {
    const chord = [bass];
    let cursor = bass;
    while (chord.length < nNotes) {
      const nexts = available.filter((p) => p > cursor && p - cursor <= 7);
      if (!nexts.length) return null;
      const nxt = nexts.slice().sort((a, b) => {
        const score = (d) => (d === 3 || d === 4 ? 0 : d === 5 ? 1 : d === 2 ? 2 : 3);
        return score(a - cursor) - score(b - cursor) || a - b;
      })[0];
      chord.push(nxt);
      cursor = nxt;
    }
    return chord;
  }

  function malletsFor(n) {
    return n === 2 ? [1, 2] : n === 3 ? [1, 2, 3] : [1, 2, 3, 4];
  }

  function buildOpen(available, bass, nNotes) {
    /* LH fifth (or 4th), RH the next closed tones. */
    const fifth = available.find((p) => p > bass && (p - bass === 7 || p - bass === 5));
    if (!fifth) return null;
    if (nNotes === 2) return [bass, fifth];
    const above = available.filter((p) => p > fifth && p - bass <= 19);
    if (nNotes === 3) {
      if (!above.length) return null;
      return [bass, fifth, above[0]];
    }
    if (above.length < 2) return null;
    return [bass, fifth, above[0], above[1]];
  }

  function buildTwoStaffChord(available, bass, nNotes, settings) {
    if (!twoStaff(settings) || bass >= 60) return null;
    const lhTop = available.find((p) => p > bass && p < 60 && (p - bass === 7 || p - bass === 5 || p - bass === 4 || p - bass === 3));
    const rhPool = available.filter((p) => p >= 60 && p <= settings.rangeHigh);
    if (!rhPool.length) return null;
    if (nNotes === 2) {
      return [bass, T.nearestIn(rhPool, 67)];
    }
    if (nNotes === 3) {
      const top = T.nearestIn(rhPool, 72);
      const mid = lhTop || T.nearestIn(rhPool.filter((p) => p < top), 64);
      return [bass, mid, top].sort((a, b) => a - b);
    }
    const a = T.nearestIn(rhPool, 64);
    const b = T.nearestIn(rhPool.filter((p) => p !== a), 72);
    const left2 = lhTop || bass;
    const chord = [...new Set([bass, left2, a, b])].sort((x, y) => x - y);
    return chord.length === nNotes ? chord : null;
  }

  function addBassUnder(melody, pool, key, settings, prevBass) {
    const bassPool = pool.filter((p) => p < 60 && p >= settings.rangeLow);
    if (!bassPool.length) return { pitches: [melody], mallets: [3] };
    const pcs = T.scalePcs(key);
    const quals = T.diatonicQualities(key);
    const topPc = ((melody % 12) + 12) % 12;
    const match = quals.filter((q) => T.chordTonesFrom(pcs[q.deg], q.q).includes(topPc));
    const list = match.length ? match : quals;
    const deg = T.weightedPick(list, (q) => (q.deg === 0 ? 4 : q.deg === 4 ? 3 : 2));
    const tones = T.chordTonesFrom(pcs[deg.deg], deg.q);
    const options = bassPool.filter((p) => tones.includes(((p % 12) + 12) % 12));
    const use = options.length ? options : bassPool;
    const target = prevBass != null ? prevBass : 48;
    const bass = T.weightedPick(use, (p) => 6 / (1 + Math.abs(p - target)));
    let extra = null;
    if (settings.mallets >= 4 && Math.random() < 0.45) {
      extra = use.find((p) => p > bass && p - bass <= 7 && p - bass >= 3);
    }
    const rh2 = settings.mallets >= 4 && Math.random() < 0.35
      ? pool.find((p) => p > melody && p <= melody + 7 && p >= 60 && tones.includes(((p % 12) + 12) % 12))
      : null;
    const pitches = [bass, extra, melody, rh2].filter((p) => p != null);
    const uniq = [...new Set(pitches)].sort((a, b) => a - b);
    const mallets = uniq.length === 2 ? [1, 3] : uniq.length === 3 ? [1, 2, 3] : [1, 2, 3, 4];
    return { pitches: uniq, mallets: mallets, bass: bass };
  }

  function createBlockWalker(settings, key, pool) {
    const quals = T.diatonicQualities(key);
    const pcs = T.scalePcs(key);
    const prog = settings.texture === "chorale"
      ? [0, 3, 4, 0, 5, 1, 4, 0]
      : [0, 0, 3, 4, 0, 5, 4, 0];
    let pi = 0;
    let hold = 0;
    let last = null;
    const startBass = T.nearestIn(
      pool,
      twoStaff(settings) ? Math.min(settings.rangeLow + 7, 50) : Math.round((settings.rangeLow * 2 + settings.rangeHigh) / 3) - 4
    );

    return function next(nNotes) {
      if (hold <= 0) {
        pi = (pi + 1) % prog.length;
        hold = settings.texture === "chorale" ? 1 : T.pick([1, 1, 2]);
      }
      hold--;
      const deg = prog[pi];
      const spec = quals.find((q) => q.deg === deg) || quals[0];
      let quality = spec.q;
      if (nNotes === 4 && quality !== "dim" && Math.random() < 0.3) {
        quality = quality === "maj" ? "maj7" : quality === "min" ? "min7" : quality;
      }
      const tones = T.chordTonesFrom(pcs[spec.deg], quality);
      const available = pool.filter((p) => tones.includes(((p % 12) + 12) % 12));
      const bassTarget = last ? last[0] : startBass;
      const basses = available.filter((p) => Math.abs(p - bassTarget) <= Math.min(settings.maxGripShift || 7, 8));
      const bassPool = basses.length ? basses : available;
      const ordered = bassPool.slice().sort((a, b) => Math.abs(a - bassTarget) - Math.abs(b - bassTarget));

      for (const bass of ordered) {
        const wantOpen = settings.voicing === "open" || twoStaff(settings);
        const chord = wantOpen
          ? buildTwoStaffChord(available, bass, nNotes, settings) ||
            buildOpen(available, bass, nNotes) ||
            stackClosed(available, bass, nNotes)
          : stackClosed(available, bass, nNotes);
        if (!playable(chord, nNotes, settings)) continue;
        if (last && Math.abs(chord[0] - last[0]) > Math.min(settings.maxGripShift || 7, 8)) continue;
        if (last && Math.abs(chord[chord.length - 1] - last[last.length - 1]) > 5) continue;
        last = chord;
        return { pitches: chord, mallets: malletsFor(nNotes) };
      }
      const fallback = voiceBlock(nNotes, pool, key, settings, last);
      last = fallback.pitches;
      return fallback;
    };
  }

  function voiceBlock(nNotes, pool, key, settings, prevChord) {
    const pcs = T.scalePcs(key);
    const quals = T.diatonicQualities(key);
    const windowCenter = prevChord
      ? Math.round(prevChord.reduce((a, b) => a + b, 0) / prevChord.length)
      : Math.round((settings.rangeLow * 2 + settings.rangeHigh) / 3);
    const winLow = Math.max(settings.rangeLow, windowCenter - 8);
    const winHigh = Math.min(settings.rangeHigh, winLow + 16);
    const localPool = pool.filter((p) => p >= winLow && p <= winHigh);
    const usePool = localPool.length >= nNotes ? localPool : pool;
    const preferredDeg = [0, 4, 5, 3, 1];

    for (let attempt = 0; attempt < 40; attempt++) {
      const deg = T.weightedPick(quals, (q) => {
        const idx = preferredDeg.indexOf(q.deg);
        return idx === -1 ? 1 : 6 - idx;
      });
      const root = pcs[deg.deg];
      const quality =
        nNotes === 4 && Math.random() < 0.35 && deg.q !== "dim"
          ? deg.q === "maj"
            ? "maj7"
            : deg.q === "min"
              ? "min7"
              : deg.q
          : deg.q;
      const tones = T.chordTonesFrom(root, quality);
      const available = usePool.filter((p) => tones.includes(((p % 12) + 12) % 12));
      if (available.length < nNotes) continue;

      let bass;
      if (prevChord && Math.random() < 0.75) {
        const near = available.filter((p) => Math.abs(p - prevChord[0]) <= 5);
        bass = near.length
          ? T.weightedPick(near, (p) => 8 - Math.abs(p - prevChord[0]))
          : T.nearestIn(available, prevChord[0]);
      } else {
        const target = windowCenter - 5;
        bass = T.weightedPick(available, (p) => 1 / (1 + Math.abs(p - target)));
      }

      const chord = stackClosed(available, bass, nNotes);
      if (!playable(chord, nNotes, settings)) continue;
      if (prevChord && Math.abs(chord[0] - prevChord[0]) > Math.min(settings.maxGripShift || 7, 7)) continue;
      if (prevChord && Math.abs(chord[chord.length - 1] - prevChord[prevChord.length - 1]) > 7) continue;

      const mallets = nNotes === 2 ? [1, 2] : nNotes === 3 ? [1, 2, 3] : [1, 2, 3, 4];
      return { pitches: chord, mallets };
    }

    if (prevChord && prevChord.length === nNotes) {
      const shift = T.pick([-2, -1, 1, 2]);
      const moved = [...new Set(prevChord.map((p) => T.nearestIn(usePool, p + shift)))].sort((a, b) => a - b);
      if (playable(moved, moved.length, settings)) {
        return {
          pitches: moved,
          mallets: moved.length === 2 ? [1, 2] : moved.length === 3 ? [1, 2, 3] : [1, 2, 3, 4],
        };
      }
    }

    const bass = T.nearestIn(usePool, windowCenter - 4);
    const pitches = [bass];
    let p = bass;
    while (pitches.length < nNotes) {
      const nxt = usePool.find((x) => x >= p + 3) || usePool[usePool.length - 1];
      if (nxt <= p) break;
      pitches.push(nxt);
      p = nxt;
    }
    const mallets = pitches.length === 2 ? [1, 2] : pitches.length === 3 ? [1, 2, 3] : [1, 2, 3, 4];
    return { pitches, mallets };
  }

  function pickNoteCount(settings, cell) {
    if (settings.texture === "melody") return 1;
    if (settings.mallets === 2) {
      if (settings.texture === "doublestops" || settings.texture === "mixed") {
        const base = settings.chordChance || settings.doubleStopChance || 0.28;
        const chance = settings.texture === "doublestops" ? Math.max(base, 0.7) : base;
        const weight = cell.dur.ticks >= T.TICKS.quarter ? 1 : cell.dur.ticks >= T.TICKS.eighth ? 0.55 : 0.12;
        return Math.random() < chance * weight ? 2 : 1;
      }
      return 1;
    }
    if (settings.texture === "mixed") {
      const chance = settings.chordChance == null ? 0.28 : settings.chordChance;
      /* Chords land on longer values so the line still reads as a melody. */
      const weight = cell.dur.ticks >= T.TICKS.quarter ? 1 : cell.dur.ticks >= T.TICKS.eighth ? 0.45 : 0.08;
      if (Math.random() > chance * weight) return 1;
      if (settings.mallets === 3) return Math.random() < 0.7 ? 3 : 2;
      return Math.random() < 0.55 ? 3 : Math.random() < 0.5 ? 2 : 4;
    }
    if (settings.texture === "block" || settings.texture === "chorale") {
      if (settings.blockSize === "3") return 3;
      if (settings.blockSize === "4") return Math.min(4, settings.mallets);
      if (settings.mallets === 3) return 3;
      const r = Math.random();
      if (r < 0.2) return 3;
      return 4;
    }
    if (settings.mallets === 3) return 3;
    if (settings.texture === "chorale") return Math.random() < 0.3 ? 3 : 4;
    return 4;
  }

  function diatonicNeighbor(pitch, pool, steps) {
    const sorted = pool.slice().sort((a, b) => a - b);
    let i = sorted.indexOf(pitch);
    if (i < 0) {
      i = sorted.findIndex((p) => p >= pitch);
      if (i < 0) i = sorted.length - 1;
    }
    const j = i + steps;
    if (j < 0 || j >= sorted.length) return null;
    return sorted[j];
  }

  function addDoubleStop(melody, pool, settings, mem) {
    mem = mem || {};
    const names = settings.stopIntervals && settings.stopIntervals.length
      ? settings.stopIntervals
      : ["3", "4", "5", "6", "8"];
    const stepOf = { "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7 };
    const dirs =
      settings.stopPlace === "above" ? [1] :
      settings.stopPlace === "below" ? [-1] :
      Math.random() < 0.75 ? [-1, 1] : [1, -1];
    const preferred = ["3", "3", "4", "5", "6", "8"].filter((n) => names.indexOf(n) >= 0);
    const order = [];
    if (mem.stop && names.indexOf(mem.stop) >= 0 && Math.random() < 0.7) {
      order.push(mem.stop);
    }
    preferred.forEach((n) => {
      if (order.indexOf(n) < 0) order.push(n);
    });
    names.forEach((n) => {
      if (order.indexOf(n) < 0) order.push(n);
    });
    for (const dir of dirs) {
      for (const name of order) {
        const other = diatonicNeighbor(melody, pool, dir * (stepOf[name] || 2));
        if (other == null || other === melody) continue;
        if (other < settings.rangeLow || other > settings.rangeHigh) continue;
        const span = Math.abs(other - melody);
        if (span < 3 || span > 12) continue;
        const pitches = [melody, other].sort((a, b) => a - b);
        mem.stop = name;
        return { pitches, mallets: [1, 2] };
      }
    }
    return { pitches: [melody], mallets: [1] };
  }

  /* Keep the melody note as the top of a chord underneath it. */
  function harmonizeMelody(top, nNotes, pool, key, settings) {
    const pcs = T.scalePcs(key);
    const quals = T.diatonicQualities(key);
    const candidates = quals.filter((q) => T.chordTonesFrom(pcs[q.deg], q.q).includes(((top % 12) + 12) % 12));
    const list = candidates.length ? candidates : quals;
    for (let attempt = 0; attempt < 20; attempt++) {
      const deg = T.weightedPick(list, (q) => (q.deg === 0 ? 4 : q.deg === 4 ? 3 : 2));
      const tones = T.chordTonesFrom(pcs[deg.deg], deg.q);
      const below = pool.filter((p) => p < top && p >= top - 16 && tones.includes(((p % 12) + 12) % 12));
      if (below.length < nNotes - 1) continue;
      const chord = [top];
      let cursor = top;
      while (chord.length < nNotes) {
        const opts = below.filter((p) => p < cursor && cursor - p <= 7);
        if (!opts.length) break;
        const nxt = opts.sort((a, b) => {
          const sa = cursor - a;
          const sb = cursor - b;
          const score = (d) => (d === 3 || d === 4 ? 0 : d === 5 ? 1 : 2);
          return score(sa) - score(sb) || sb - sa;
        })[0];
        chord.push(nxt);
        cursor = nxt;
      }
      chord.sort((a, b) => a - b);
      if (chord.length === nNotes && playable(chord, nNotes, settings)) {
        return {
          pitches: chord,
          mallets: nNotes === 2 ? [1, 2] : nNotes === 3 ? [1, 2, 3] : [1, 2, 3, 4],
        };
      }
    }
    return voiceBlock(nNotes, pool, key, settings, [top]);
  }

  function resolveKey(settings) {
    const all = T.KEYS;
    let ids = Array.isArray(settings.keyIds) ? settings.keyIds.filter(Boolean) : [];
    if (!ids.length) {
      if (settings.keyId && settings.keyId !== "random") ids = [settings.keyId];
      else ids = all.map((k) => k.id);
    }
    const pool = all.filter((k) => ids.indexOf(k.id) >= 0);
    const ordered = pool.slice().sort((a, b) => T.circleRank(a) - T.circleRank(b));
    if (!ordered.length) return all[0];
    if (ordered.length === 1) return ordered[0];
    const idx = Math.abs(parseInt(settings.keyIndex, 10) || 0) % ordered.length;
    return ordered[idx];
  }

  function applyDynamics(measures, settings) {
    if (!settings.dynamics) return;
    const notes = [];
    measures.forEach((m) => {
      m.events.forEach((e) => {
        if (!e.rest && e.pitches && e.pitches.length) notes.push(e);
      });
    });
    if (!notes.length) return;
    const ladder = ["p", "mp", "mf", "f"];
    let step = 1 + (Math.random() < 0.5 ? 1 : 0);
    notes[0].dynamic = ladder[step];
    function hairpin(from, to, up) {
      if (to <= from || to >= notes.length) return;
      notes[from].hairpin = up ? "cresc-start" : "dim-start";
      notes[to].hairpin = up ? "cresc-end" : "dim-end";
      step = Math.max(0, Math.min(ladder.length - 1, step + (up ? 1 : -1)));
      notes[to].dynamic = ladder[step];
    }
    if (notes.length >= 6) {
      const a = Math.min(2, notes.length - 4);
      const b = Math.min(notes.length - 2, a + 3 + Math.floor(Math.random() * 2));
      hairpin(a, b, step < 2);
    }
    if (notes.length >= 14) {
      const a = Math.floor(notes.length * 0.55);
      const b = Math.min(notes.length - 1, a + 4);
      hairpin(a, b, step < 2);
    }
  }

  function plainEnding(span, endTonic) {
    const units = [96, 72, 48, 36, 24, 12, 6, 3].map((t) => durByTicks(t)).filter(Boolean);
    const minFinal = Math.min(span, T.TICKS.quarter);
    const finals = units.filter((d) => d.ticks <= span && d.ticks >= minFinal);
    const finalDur = (finals.length ? finals : units.filter((d) => d.ticks <= span))
      .slice()
      .sort((a, b) => b.ticks - a.ticks)[0];
    if (!finalDur) return null;
    const out = [];
    let rem = span - finalDur.ticks;
    const small = [24, 12, 6, 3].map((t) => durByTicks(t)).filter(Boolean);
    while (rem > 0) {
      const d = small.find((u) => u.ticks <= rem);
      if (!d) return null;
      out.push({ dur: d, rest: false, tuplet: null });
      rem -= d.ticks;
    }
    out.push({ dur: finalDur, rest: false, tuplet: null, cadence: endTonic ? "tonic" : null });
    if (endTonic && out.length > 1) out[out.length - 2].cadence = "approach";
    return out;
  }

  /* The last beat is one long note, not a run of sixteenths. */
  function settleEnding(events, ticks, beat, endTonic) {
    if (!events.length || !ticks) return null;
    const b = beat || T.TICKS.quarter;
    const beats = Math.max(1, Math.round(ticks / b));
    const want = b * (beats >= 4 ? 2 : 1);
    const head = events.slice();
    let freed = 0;
    const popOne = () => {
      if (!head.length) return false;
      let last = head.pop();
      freed += last.dur.ticks;
      while (last.tuplet && last.tuplet !== "start" && head.length) {
        last = head.pop();
        freed += last.dur.ticks;
      }
      return true;
    };
    while (head.length && (freed < want || (b && (ticks - freed) % b !== 0))) {
      if (!popOne()) break;
    }
    if (freed <= 0) return null;
    const tail = plainEnding(freed, endTonic);
    if (!tail) return null;
    const out = head.concat(tail);
    const used = out.reduce((s, e) => s + e.dur.ticks, 0);
    if (used !== ticks) return null;
    const last = out[out.length - 1];
    if (!last || last.rest || last.dur.ticks < Math.min(ticks, T.TICKS.quarter)) return null;
    return out;
  }

  function generate(settings) {
    const key = resolveKey(settings);
    const time =
      settings.timeId === "random"
        ? T.pick(T.TIMES.filter((t) => ["4/4", "3/4", "2/4", "6/8"].includes(t.id)))
        : T.TIMES.find((t) => t.id === settings.timeId) || T.TIMES[0];

    const pool = pitchPool(settings, key);
    const treblePool = twoStaff(settings) ? pool.filter((p) => p >= 60) : pool;
    const melodyPool = (treblePool.length >= 5 ? treblePool : pool).slice().sort((a, b) => a - b);
    const melodyNext = createMelodyWalker(settings, key, melodyPool);
    const measures = [];
    let prevPitch = null;
    let prevChord = null;
    let prevBass = null;
    let motif = null;
    let motifLeft = 0;
    const lineMem = { stop: null };
    const blockNext =
      settings.texture === "block" || settings.texture === "chorale"
        ? createBlockWalker(settings, key, pool)
        : null;

    for (let m = 0; m < settings.measures; m++) {
      let rhythm;
      if (motif && motifLeft > 0 && m !== settings.measures - 1) {
        rhythm = motif.map((e) => ({ dur: e.dur, rest: e.rest, tuplet: e.tuplet || null, tie: !!e.tie }));
        motifLeft--;
      } else {
        rhythm = buildRhythm(settings, time.ticks, time.beatTicks);
        rhythm = applySyncopation(rhythm, time.ticks, time.beatTicks, settings);
        motif = rhythm.map((e) => ({ dur: e.dur, rest: e.rest, tuplet: e.tuplet || null, tie: !!e.tie }));
        motifLeft = 1;
      }

      const lastBar = m === settings.measures - 1;
      if (lastBar) {
        const settled = settleEnding(rhythm, time.ticks, time.beatTicks, settings.endTonic !== false);
        if (settled) rhythm = settled;
        else if (settings.endTonic !== false) {
          const sounding = rhythm.map((ev, i) => ({ ev: ev, i: i })).filter((x) => !x.ev.rest);
          if (sounding.length) sounding[sounding.length - 1].ev.cadence = "tonic";
          if (sounding.length > 1) sounding[sounding.length - 2].ev.cadence = "approach";
        }
      }

      const events = [];
      let barPos = 0;
      for (const cell of rhythm) {
        const onBeat = time.beatTicks ? barPos % time.beatTicks === 0 : true;
        barPos += cell.dur.ticks;
        if (cell.rest) {
          events.push({
            rest: true,
            dur: cell.dur,
            pitches: [],
            mallets: [],
            tuplet: cell.tuplet || null,
            syncTie: !!cell.tie,
          });
          continue;
        }

        let n = pickNoteCount(settings, cell);
        if (cell.dur.ticks < T.TICKS.quarter && n > 1 && !(twoStaff(settings) && cell.tuplet)) n = 1;
        let pitches;
        let mallets;
        const melodyPitch = melodyNext(cell.cadence || (onBeat ? "beat" : null));

        if (settings.texture === "melody") {
          pitches = [melodyPitch];
          mallets = settings.mallets === 4 ? [T.pick([2, 3])] : [settings.mallets === 3 ? 2 : 1];
          prevPitch = melodyPitch;
          prevChord = pitches;
        } else if (twoStaff(settings) && settings.texture === "mixed") {
          const addBass =
            n > 1 ||
            !!cell.tuplet ||
            cell.dur.ticks >= T.TICKS.quarter ||
            (cell.dur.ticks >= T.TICKS.eighth && Math.random() < 0.55);
          if (addBass) {
            const voiced = addBassUnder(melodyPitch, pool, key, settings, prevBass);
            pitches = voiced.pitches;
            mallets = voiced.mallets;
            prevBass = voiced.bass;
          } else {
            pitches = [melodyPitch];
            mallets = [3];
          }
          prevPitch = melodyPitch;
          prevChord = pitches;
        } else if (n === 1) {
          pitches = [melodyPitch];
          mallets = settings.mallets === 4 ? [T.pick([2, 3])] : [settings.mallets === 3 ? 2 : 1];
          prevPitch = melodyPitch;
          prevChord = pitches;
        } else if (settings.mallets === 2 && (settings.texture === "mixed" || settings.texture === "doublestops")) {
          const voiced = addDoubleStop(melodyPitch, pool, settings, lineMem);
          pitches = voiced.pitches;
          mallets = voiced.mallets;
          prevPitch = melodyPitch;
          prevChord = pitches;
        } else if (settings.texture === "mixed") {
          const voiced = harmonizeMelody(melodyPitch, n, pool, key, settings);
          pitches = voiced.pitches;
          mallets = voiced.mallets;
          prevPitch = melodyPitch;
          prevChord = pitches;
        } else if (blockNext) {
          const voiced = blockNext(n);
          pitches = colorTop(voiced.pitches, settings, key, cell);
          mallets = voiced.mallets;
          prevPitch = pitches[Math.floor(pitches.length / 2)];
          prevChord = pitches;
        } else {
          const voiced = voiceBlock(n, pool, key, settings, prevChord);
          pitches = colorTop(voiced.pitches, settings, key, cell);
          mallets = voiced.mallets;
          prevPitch = pitches[Math.floor(pitches.length / 2)];
          prevChord = pitches;
        }

        const art = [];
        if (settings.accents && Math.random() < 0.12) art.push("a");
        if (settings.staccato && Math.random() < 0.14) art.push("staccato");

        const roll =
          settings.rolls !== "off" &&
          !cell.tuplet &&
          pitches.length >= 1 &&
          (settings.rolls === "always"
            ? cell.dur.ticks >= T.TICKS.quarter
            : cell.dur.ticks >= T.TICKS.half) &&
          Math.random() < (settings.rolls === "always"
            ? (cell.dur.ticks >= T.TICKS.half ? 0.8 : 0.45)
            : 0.8);

        events.push({
          rest: false,
          dur: cell.dur,
          pitches,
          mallets,
          articulations: art,
          roll,
          tie: false,
          syncTie: !!cell.tie,
          tuplet: cell.tuplet || null,
        });
      }

      /* Ties = hold the same pitch. No slurs. */
      if (settings.ties) {
        for (let i = 0; i < events.length - 1; i++) {
          const a = events[i];
          const b = events[i + 1];
          if (a.rest || b.rest || a.tuplet || b.tuplet) continue;
          if (a.dur.ticks < T.TICKS.quarter || b.dur.ticks < T.TICKS.quarter) continue;
          if (!a.pitches.length || !b.pitches.length) continue;
          if (a.pitches.length > 2 || b.pitches.length > 2) continue;
          const same =
            a.pitches.length === b.pitches.length &&
            a.pitches.every((p, j) => p === b.pitches[j]);
          if (same || Math.random() < 0.22) {
            b.pitches = a.pitches.slice();
            if (a.mallets) b.mallets = a.mallets.slice();
            a.tie = true;
          }
        }
      }

      for (let i = 0; i < events.length - 1; i++) {
        const a = events[i];
        const b = events[i + 1];
        if (!a.syncTie || a.rest || b.rest || !a.pitches || !a.pitches.length) continue;
        b.pitches = a.pitches.slice();
        if (a.mallets) b.mallets = a.mallets.slice();
        a.tie = true;
      }

      let used = events.reduce((s, e) => s + e.dur.ticks, 0);
      while (used > time.ticks && events.length) {
        let last = events.pop();
        used -= last.dur.ticks;
        while (last.tuplet && last.tuplet !== "start" && events.length) {
          last = events.pop();
          used -= last.dur.ticks;
        }
      }
      if (used < time.ticks) {
        let fill = time.ticks - used;
        const units = T.DURATIONS.filter((d) => !d.dots && !d.group).sort((a, b) => b.ticks - a.ticks);
        units.forEach((d) => {
          while (fill >= d.ticks) {
            events.push({ rest: true, dur: d, pitches: [], mallets: [] });
            fill -= d.ticks;
          }
        });
      }
      measures.push({ events });
    }

    applyDynamics(measures, settings);

    let clef = settings.clef;
    const writeOff = T.writtenOff(settings.instrumentId);
    const allPitches = measures.flatMap((ms) => ms.events.flatMap((e) => e.pitches));
    const written = allPitches.map((p) => p + writeOff);
    const lo = written.length ? Math.min(...written) : settings.rangeLow + writeOff;
    const hi = written.length ? Math.max(...written) : settings.rangeHigh + writeOff;
    const soundingEvents = measures.flatMap((ms) => ms.events.filter((e) => !e.rest && e.pitches.length));
    const lowShare = soundingEvents.length
      ? soundingEvents.filter((e) => e.pitches.some((p) => p + writeOff < 55)).length / soundingEvents.length
      : 0;
    const highShare = soundingEvents.length
      ? soundingEvents.filter((e) => e.pitches.some((p) => p + writeOff >= 60)).length / soundingEvents.length
      : 0;
    const reallyGrand =
      writeOff === 0 &&
      lowShare >= 0.25 &&
      highShare >= 0.25 &&
      (settings.texture === "block" || settings.texture === "chorale");
    const instLock = T.INSTRUMENTS.find((i) => i.id === settings.instrumentId);
    if (instLock && instLock.defaultClef === "treble") {
      clef = "treble";
    } else if (writeOff !== 0) {
      clef = "treble";
    } else if (twoStaff(settings)) {
      clef = "grand";
    } else if (settings.clef === "auto") {
      if (reallyGrand) clef = "grand";
      else clef = "auto"; /* renderer switches treble/bass by measure */
    } else if (clef === "grand") {
      const mid = written.length
        ? written.reduce((a, b) => a + b, 0) / written.length
        : 60;
      if (reallyGrand) clef = "grand";
      else if (mid < 62 || hi <= 65) clef = "bass";
      else clef = "treble";
    }

    return {
      key,
      time,
      clef,
      measures,
      settingsSnapshot: {
        mallets: settings.mallets,
        texture: settings.texture,
        showSticking: settings.showSticking,
        instrument: settings.instrumentId,
        tempo: settings.tempo,
      },
    };
  }

  global.Generator = { generate };
})(window);
