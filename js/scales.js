/* scales.js — keys, scales, and the mapping from a grid row to a pitch. */
window.PM = window.PM || {};
PM.scales = (function () {
  const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const SOLFEGE = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

  const LIST = [
    { id: 'majorPenta', label: 'Major pentatonic', semis: [0, 2, 4, 7, 9] },
    { id: 'minorPenta', label: 'Minor pentatonic', semis: [0, 3, 5, 7, 10] },
    { id: 'major', label: 'Major', semis: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'minor', label: 'Natural minor', semis: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'harmonicMinor', label: 'Harmonic minor', semis: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'dorian', label: 'Dorian', semis: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian', label: 'Phrygian', semis: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian', label: 'Lydian', semis: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', label: 'Mixolydian', semis: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'blues', label: 'Blues', semis: [0, 3, 5, 6, 7, 10] },
    { id: 'wholeTone', label: 'Whole tone', semis: [0, 2, 4, 6, 8, 10] },
    { id: 'chromatic', label: 'Chromatic', semis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
  ];
  const byId = function (id) {
    return LIST.find(function (s) { return s.id === id; }) || LIST[0];
  };

  /* Note naming is independent of the interface language: someone may well
     want Do Ré Mi in an English interface, or the opposite. */
  let names = 'letters';
  function setNames(m) { names = m; }
  function pitchName(semi) { return (names === 'solfege' ? SOLFEGE : SHARP)[((semi % 12) + 12) % 12]; }
  function noteLabel(midi) { return pitchName(midi) + (Math.floor(midi / 12) - 1); }

  /* Grid pitches, lowest first. The tonic is repeated at the very top. */
  function pitches(keySemi, scaleId, octaves, baseOctave) {
    const sc = byId(scaleId).semis;
    const base = (baseOctave + 1) * 12 + keySemi;
    const out = [];
    for (let o = 0; o < octaves; o++) {
      for (let i = 0; i < sc.length; i++) out.push(base + o * 12 + sc[i]);
    }
    out.push(base + octaves * 12);
    return out;
  }
  /* Rows that land on a tonic, used for the coloured bands on the canvas. */
  function tonicRows(scaleId, octaves) {
    const n = byId(scaleId).semis.length;
    const rows = [];
    for (let o = 0; o <= octaves; o++) rows.push(o * n);
    return rows;
  }

  return {
    LIST: LIST, SHARP: SHARP, SOLFEGE: SOLFEGE,
    byId: byId, setNames: setNames, pitchName: pitchName, noteLabel: noteLabel,
    pitches: pitches, tonicRows: tonicRows
  };
})();
