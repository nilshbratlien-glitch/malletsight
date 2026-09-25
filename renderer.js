/* ABC / abcjs rendering — beaming and stems follow standard notation */
(function (global) {
  const T = global.Theory;

  function abcOctaveLetter(letter, oct) {
    if (oct <= 1) return letter + ",,,";
    if (oct === 2) return letter + ",,";
    if (oct === 3) return letter + ",";
    if (oct === 4) return letter;
    if (oct === 5) return letter.toLowerCase();
    if (oct === 6) return letter.toLowerCase() + "'";
    if (oct === 7) return letter.toLowerCase() + "''";
    return letter.toLowerCase() + "'''";
  }

  function midiToAbcNote(midi, key) {
    const pc = ((midi % 12) + 12) % 12;
    const oct = T.midiOctave(midi);
    const scale = T.scalePcs(key);
    const raw = T.midiToName(midi, key.flats);
    const letter = raw[0].toUpperCase();
    let acc = "";
    if (scale.indexOf(pc) === -1) {
      if (raw.indexOf("#") >= 0) acc = "^";
      else if (raw.indexOf("b") >= 0) acc = "_";
    }
    return acc + abcOctaveLetter(letter, oct);
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function durAbc(ticks) {
    const unit = T.TICKS.sixteenth;
    let n = ticks;
    let d = unit;
    const g = gcd(n, d);
    n /= g;
    d /= g;
    if (d === 1) return n === 1 ? "" : String(n);
    if (n === 1) return "/" + d;
    return n + "/" + d;
  }

  function abcTicks(ev) {
    return ev.dur.writtenTicks || ev.dur.ticks;
  }

  function eventToken(ev, score, options) {
    if (ev.rest || !ev.pitches || !ev.pitches.length) {
      return "z" + durAbc(abcTicks(ev));
    }
    const off = T.writtenOff(score.settingsSnapshot.instrument);
    const pitches = [...new Set(ev.pitches)].sort((a, b) => a - b).map((p) => p + off);
    const notes = pitches.map((p) => midiToAbcNote(p, score.key));
    const len = durAbc(abcTicks(ev));
    let body;
    if (notes.length === 1) body = notes[0] + len;
    else body = "[" + notes[0] + len + notes.slice(1).join("") + "]";
    if (ev.tie) body += "-";
    if (ev.articulations && ev.articulations.indexOf("staccato") >= 0) body = "." + body;
    if (ev.articulations && ev.articulations.indexOf("a") >= 0) body = "!>!" + body;
    if (options.showSticking && ev.mallets && ev.mallets.length) {
      body = '"' + ev.mallets.join("") + '"' + body;
    }
    return body;
  }

  function measureClef(measure, off, prev) {
    const pts = measure.events.flatMap((e) => (e.pitches || []).map((p) => p + off));
    if (!pts.length) return prev || "treble";
    const mid = pts.reduce((a, b) => a + b, 0) / pts.length;
    const lowShare = pts.filter((p) => p <= 55).length / pts.length;
    const highShare = pts.filter((p) => p >= 62).length / pts.length;
    if (highShare >= 0.65) return "treble";
    if (lowShare >= 0.65) return "bass";
    if (mid >= 60) return "treble";
    if (mid <= 54) return "bass";
    return prev || (mid >= 58 ? "treble" : "bass");
  }

  function staffClef(score) {
    if (score.clef === "bass" || score.clef === "treble" || score.clef === "grand" || score.clef === "auto") {
      return score.clef;
    }
    const off = T.writtenOff(score.settingsSnapshot.instrument);
    const pitches = score.measures.flatMap((m) => m.events.flatMap((e) => (e.pitches || []).map((p) => p + off)));
    if (!pitches.length) return "treble";
    const mid = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const lo = Math.min.apply(null, pitches);
    const hi = Math.max.apply(null, pitches);
    if (lo < 55 && hi >= 64) return "grand";
    if (mid < 62 || hi <= 65) return "bass";
    return "treble";
  }

  function packStaffEvents(events, barTicks) {
    const raw = [];
    events.forEach((ev) => {
      if (ev.rest && !ev.tuplet && raw.length && raw[raw.length - 1].rest && !raw[raw.length - 1].tuplet) {
        raw[raw.length - 1] = {
          rest: true,
          dur: { ticks: raw[raw.length - 1].dur.ticks + ev.dur.ticks },
          pitches: [],
          mallets: [],
        };
      } else if (ev.rest && ev.tuplet) {
        raw.push(ev);
      } else if (ev.rest) {
        raw.push({ rest: true, dur: { ticks: ev.dur.ticks }, pitches: [], mallets: [] });
      } else {
        raw.push(ev);
      }
    });
    const units = T.DURATIONS.filter((d) => !d.group).map((d) => d.ticks).sort((a, b) => b - a);
    const out = [];
    raw.forEach((ev) => {
      if (!ev.rest || ev.tuplet) {
        out.push(ev);
        return;
      }
      let t = ev.dur.ticks;
      units.forEach((u) => {
        while (t >= u) {
          out.push({ rest: true, dur: { ticks: u }, pitches: [], mallets: [] });
          t -= u;
        }
      });
    });
    const sounding = out.some((e) => !e.rest);
    if (!sounding && barTicks) {
      return [{ rest: true, dur: { ticks: barTicks }, pitches: [], mallets: [] }];
    }
    return out;
  }

  function measureAbc(measure, score, options, time) {
    const beat = time.beatTicks || T.TICKS.quarter;
    let out = "";
    let beam = "";
    let acc = 0;
    let inTuplet = false;
    const flush = () => {
      if (beam) out += beam + " ";
      beam = "";
    };
    measure.events.forEach((ev) => {
      let tok = eventToken(ev, score, options);
      const grouped = ev.dur.group > 1;
      const beamable = !ev.rest && ev.dur.beamable && ev.pitches && ev.pitches.length;
      if (grouped && ev.tuplet === "start") {
        if (!beamable) flush();
        tok = "(3" + tok;
        inTuplet = true;
      }
      if (!grouped && !beamable) {
        flush();
        out += tok + " ";
      } else {
        beam += tok;
      }
      if (grouped && ev.tuplet === "end") inTuplet = false;
      acc += ev.dur.ticks;
      if (!inTuplet && beat && acc % beat === 0) flush();
    });
    flush();
    return out.trim();
  }

  function splitEv(ev, split, side, off) {
    off = off || 0;
    if (ev.rest) return ev;
    const pitches = (ev.pitches || []).filter((p) =>
      side === "upper" ? p + off >= split : p + off < split
    );
    if (!pitches.length) return { rest: true, dur: ev.dur, pitches: [], mallets: [], tuplet: ev.tuplet || null };
    return Object.assign({}, ev, { pitches: pitches });
  }

  function scoreToAbc(score, options) {
    const inst = T.INSTRUMENTS.find((i) => i.id === score.settingsSnapshot.instrument);
    const off = inst && inst.writtenOff ? inst.writtenOff : 0;
    const trans = off === -12 ? " · sounds 8va" : off === -24 ? " · sounds 15ma" : "";
    const title =
      (inst ? inst.name : "Mallets") +
      trans +
      " · " +
      score.settingsSnapshot.mallets +
      " mallets · " +
      score.key.name;
    let clef = staffClef(score);
    if (inst && inst.defaultClef === "treble") clef = "treble";
    const keyId = score.key.id;
    const lines = [
      "X:1",
      "T:" + title,
      "M:" + score.time.id,
      "L:1/16",
      "Q:1/4=" + (score.settingsSnapshot.tempo || 80),
      "%%stretchlast 0",
    ];
    if (clef === "grand") {
      lines.push("%%staves {1 2}");
      lines.push("K:" + keyId);
      const upper = [];
      const lower = [];
      score.measures.forEach((m) => {
        const u = {
          events: packStaffEvents(
            m.events.map((ev) => splitEv(ev, 60, "upper", off)),
            score.time.ticks
          ),
        };
        const l = {
          events: packStaffEvents(
            m.events.map((ev) => splitEv(ev, 60, "lower", off)),
            score.time.ticks
          ),
        };
        upper.push(measureAbc(u, score, options, score.time));
        lower.push(measureAbc(l, score, options, score.time));
      });
      lines.push("V:1 clef=treble");
      lines.push(upper.join(" | ") + " |]");
      lines.push("V:2 clef=bass");
      lines.push(lower.join(" | ") + " |]");
    } else if (clef === "auto") {
      let prev = null;
      const parts = [];
      score.measures.forEach((m, i) => {
        const c = measureClef(m, off, prev);
        const music = measureAbc(m, score, options, score.time);
        if (i === 0) {
          lines.push("K:" + keyId + " clef=" + c);
          parts.push(music);
        } else if (c !== prev) {
          parts.push("[K:" + keyId + " clef=" + c + "] " + music);
        } else {
          parts.push(music);
        }
        prev = c;
      });
      lines.push(parts.join(" | ") + " |]");
    } else {
      lines.push("K:" + keyId + " clef=" + (clef === "bass" ? "bass" : "treble"));
      const body = score.measures.map((m) => measureAbc(m, score, options, score.time)).join(" | ");
      lines.push(body + " |]");
    }
    return lines.join("\n");
  }

  function renderScore(container, score, options) {
    options = options || {};
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "score-inner abc-wrap";
    container.appendChild(wrap);

    if (typeof ABCJS === "undefined") {
      wrap.innerHTML = '<p class="error">Notation engine missing (abcjs).</p>';
      return;
    }

    const abc = scoreToAbc(score, options);
    const pageW = Math.max(280, container.clientWidth || 800);
    const scale = Math.max(0.75, Math.min(1.8, options.zoom || 1));
    try {
      ABCJS.renderAbc(wrap, abc, {
        scale: scale,
        staffwidth: Math.max(240, pageW - 36),
        paddingtop: 8,
        paddingbottom: 12,
        paddingleft: 8,
        paddingright: 12,
        wrap: {
          minSpacing: 1.35,
          maxSpacing: 2.2,
          staffwidth: Math.max(240, pageW - 36),
        },
        add_classes: true,
      });
    } catch (err) {
      console.error(err);
      wrap.innerHTML =
        '<p class="error">Could not render this etude.<br><small>' +
        String(err.message || err) +
        "</small></p>";
    }
  }

  global.ScoreRenderer = { renderScore, scoreToAbc };
})(window);
