/**
 * Per-exercise motion for the form-cue engine, ported from the canvas
 * prototypes. Each def drives IK against the real equipment.
 * Units: metres. +X = facing, +Y = up, +Z = athlete's right.
 */
import type { FormDef, FormEngine, V } from "./engine";
import type { FormCueId } from "./cue-ids";

const R = Math.PI / 180;

/** Conventional deadlift: bar path vertical over mid-foot; legs drive first, then hips. */
function deadlift(E: FormEngine): FormDef {
  const BAR = [[0, 0.225], [0.14, 0.225], [0.44, 0.865], [0.58, 0.865], [0.92, 0.225], [1, 0.225]];
  // Back angle from vertical. Legs drive first (angle holds until the bar clears the knee), then hips extend.
  // On the way down the hips hinge back first, then the knees bend once the bar passes them.
  const BACK = [[0, 60], [0.14, 60], [0.27, 53], [0.44, 0], [0.58, 0], [0.72, 44], [0.82, 54], [0.92, 60], [1, 60]];
  const BX = 0.04;
  return {
    dur: 5.2,
    keyT: 0.1,
    ghostT: 0.5,
    v0: 1,
    target: [0.02, 0.74, 0],
    dist: 3.25,
    F: 560,
    views: [
      { n: "Side", yaw: 0, pitch: 0.1, d: 3.25 },
      { n: "¾", yaw: 0.62, pitch: 0.2, d: 3.35 },
      { n: "Front", yaw: 1.5708, pitch: 0.1, d: 3.9 },
    ],
    phases: [
      { n: "Brace", s: 0, e: 0.14 },
      { n: "Push floor", s: 0.14, e: 0.44 },
      { n: "Lock out", s: 0.44, e: 0.58 },
      { n: "Lower", s: 0.58, e: 0.92 },
      { n: "Reset", s: 0.92, e: 1 },
    ],
    readLabel: "BACK ANGLE",
    pose: (t) => {
      const out = E.newOut();
      const b = E.kf(BAR, t);
      const thd = E.kf(BACK, t);
      const th = thd * R;
      const dir: V = [Math.sin(th), Math.cos(th), 0];
      // Arms hang straight from the shoulders to the bar; shoulders sit slightly ahead of the bar when bent over.
      const sMid: V = [BX + 0.06 * (Math.sin(th) / Math.sin(60 * R)), b + 0.565, 0];
      const P = E.sub(sMid, E.mul(dir, 0.5));
      const J = E.body(
        {
          pelvis: P,
          theta: th,
          headDir: dir,
          ankles: [[-0.04, 0.075, -0.13], [-0.04, 0.075, 0.13]],
          footDir: (sd) => E.nrm([1, 0, 0.18 * sd]),
          kneePole: (sd) => [1, 0.2, 0.35 * sd],
          hands: [[BX, b, -0.24], [BX, b, 0.24]],
          elbowPole: (sd) => [-0.2, 0, sd],
        },
        out
      );
      // Barbell: 20 kg bar + two 20 kg plates a side = 100 kg.
      out.segs.push({ a: [BX, b, -0.5], b: [BX, b, 0.5], ra: 0.014, rb: 0.014, k: "eq", col: "steel" });
      [-1, 1].forEach((sd) => {
        out.segs.push({ a: [BX, b, 0.5 * sd], b: [BX, b, 1.08 * sd], ra: 0.025, rb: 0.025, k: "eq", col: "steel" });
        out.discs.push({ c: [BX, b, 0.565 * sd], r: 0.225, th: 0.045, rim: "#FF6A2B", hub: 0.03, alpha: 0.72 });
        out.discs.push({ c: [BX, b, 0.615 * sd], r: 0.225, th: 0.045, rim: "#FF6A2B", hub: 0.03, alpha: 0.72 });
        out.discs.push({ c: [BX, b, 0.66 * sd], r: 0.04, th: 0.03, face0: "#9A9AA2", face1: "#3A3A40" });
      });
      const ph = t < 0.14 ? 0 : t < 0.44 ? 1 : t < 0.58 ? 2 : t < 0.92 ? 3 : 4;
      const breathe = 0.5 + 0.5 * Math.sin(t * 52);
      out.act = {
        core: { a: ph === 0 ? 0.55 + 0.4 * breathe : ph < 4 ? 0.32 : 0, c: "ice" },
        glute: { a: [0, 1, 0.85, 0.55, 0][ph], c: "ember" },
        thigh: { a: [0, 0.9, 0.5, 0.5, 0][ph], c: "ember" },
        lat: { a: [0, 0.55, 0.4, 0.45, 0][ph], c: "ember" },
      };
      if (ph === 0) out.rings.push({ c: E.add(P, E.mul(dir, 0.13)), n: dir, r: 0.17 + 0.025 * breathe, col: "#8CC8FF", a: 0.9 });
      out.guides.push({ pts: [[BX, 0.003, -0.34], [BX, 0.003, 0.34]], col: "rgba(140,200,255,.55)", dash: true, w: 1.5 });
      out.guides.push({ pts: [[BX, 0.225, 0.45], [BX, 0.9, 0.45]], col: "rgba(140,200,255,.22)", dash: true, w: 1, top: true });
      out.track = [BX, b, 0.45];
      out.labels.push({ p: E.add(J.hips[1], [0, 0, 0.12]), text: `back ${Math.round(thd)}°`, col: "#8CC8FF", dx: -96, dy: -30 });
      if (ph === 0)
        out.labels.push({ p: E.add(P, E.add(E.mul(dir, 0.13), [0, 0, 0.2])), text: "brace", col: "#8CC8FF", dx: 16, dy: 6 });
      out.read = `${Math.round(thd)}°`;
      return out;
    },
  };
}

/** Wide-grip lat pulldown, seated: bar to the upper chest, elbows drive to the hips. */
function latPulldown(E: FormEngine): FormDef {
  // Tempo: 1 s pull, 1 s squeeze at the bottom, 2 s controlled return.
  const BY = [[0, 1.5], [0.24, 0.97], [0.46, 0.97], [0.92, 1.5], [1, 1.5]];
  const BXK = [[0, 0.02], [0.24, -0.03], [0.46, -0.03], [0.92, 0.02], [1, 0.02]];
  const LEAN = [[0, -12], [0.24, -20], [0.46, -20], [0.92, -12], [1, -12]];
  return {
    dur: 4.6,
    keyT: 0.35,
    ghostT: 0.02,
    v0: 1,
    target: [0.18, 1.12, 0],
    dist: 3.5,
    F: 520,
    views: [
      { n: "Side", yaw: 0, pitch: 0.08, d: 3.5 },
      { n: "¾", yaw: -0.7, pitch: 0.16, d: 3.55 },
      { n: "Back", yaw: -1.5708, pitch: 0.12, d: 3.7 },
    ],
    phases: [
      { n: "Pull", s: 0, e: 0.24 },
      { n: "Squeeze", s: 0.24, e: 0.46 },
      { n: "2 s return", s: 0.46, e: 0.92, count: true },
      { n: "Reach", s: 0.92, e: 1 },
    ],
    readLabel: "ELBOW → HIP",
    pose: (t) => {
      const out = E.newOut();
      const by = E.kf(BY, t);
      const bx = E.kf(BXK, t);
      const th = E.kf(LEAN, t) * R;
      const J = E.body(
        {
          pelvis: [0, 0.55, 0],
          theta: th,
          headDir: [0.25, 1, 0],
          ankles: [[0.4, 0.075, -0.15], [0.4, 0.075, 0.15]],
          footDir: () => [1, 0, 0],
          kneePole: (sd) => [0.3, 1, 0.15 * sd],
          hands: [[bx, by, -0.4], [bx, by, 0.4]],
          // Elbows drive down and back toward the hips, flaring slightly out.
          elbowPole: (sd) => [-0.55, -1, 0.6 * sd],
        },
        out
      );
      // Machine: seat, thigh pad, column, high pulley, cable, weight stack.
      const lift = (1.5 - by) * 0.55;
      out.segs.push(
        { a: [0, 0, 0], b: [0, 0.41, 0], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [-0.13, 0.47, -0.13], b: [0.15, 0.47, -0.13], ra: 0.06, rb: 0.06, k: "eq", col: "pad" },
        { a: [-0.13, 0.47, 0.13], b: [0.15, 0.47, 0.13], ra: 0.06, rb: 0.06, k: "eq", col: "pad" },
        { a: [0.34, 0.66, -0.24], b: [0.34, 0.66, 0.24], ra: 0.05, rb: 0.05, k: "eq", col: "pad" },
        { a: [0.34, 0.66, 0], b: [0.66, 0.66, 0], ra: 0.02, rb: 0.02, k: "eq", col: "dark" },
        { a: [-0.25, 0.02, 0], b: [0.66, 0.02, 0], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [0.66, 0, -0.28], b: [0.66, 0, 0.28], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [0.66, 0, 0], b: [0.66, 2.3, 0], ra: 0.045, rb: 0.045, k: "eq", col: "dark" },
        { a: [0.66, 2.3, 0], b: [-0.02, 2.3, 0], ra: 0.04, rb: 0.04, k: "eq", col: "dark" },
        { a: [0.84, 0, -0.17], b: [0.84, 1.3, -0.17], ra: 0.012, rb: 0.012, k: "eq", col: "steel" },
        { a: [0.84, 0, 0.17], b: [0.84, 1.3, 0.17], ra: 0.012, rb: 0.012, k: "eq", col: "steel" },
        { a: [bx, by, -0.45], b: [bx, by, 0.45], ra: 0.013, rb: 0.013, k: "eq", col: "steel" },
        { a: [bx, by, -0.45], b: [bx, by - 0.07, -0.62], ra: 0.013, rb: 0.013, k: "eq", col: "steel" },
        { a: [bx, by, 0.45], b: [bx, by - 0.07, 0.62], ra: 0.013, rb: 0.013, k: "eq", col: "steel" },
        { a: [bx, by, -0.47], b: [bx, by, -0.33], ra: 0.02, rb: 0.02, k: "eq", col: "pad" },
        { a: [bx, by, 0.33], b: [bx, by, 0.47], ra: 0.02, rb: 0.02, k: "eq", col: "pad" },
        { a: [0, 2.18, 0], b: [bx, by + 0.02, 0], ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.75)" },
        { a: [0.06, 2.3, 0], b: [0.84, 2.3, 0], ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.5)" },
        { a: [0.84, 2.3, 0], b: [0.84, 0.62 + lift, 0], ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.75)" }
      );
      for (let i = 0; i < 10; i++) {
        const y = 0.08 + i * 0.05 + (i >= 7 ? lift : 0);
        out.segs.push({ a: [0.84, y, -0.15], b: [0.84, y, 0.15], ra: 0.022, rb: 0.022, k: "eq", col: i >= 7 ? "ember" : "dark" });
      }
      out.discs.push({ c: [0, 2.24, 0], r: 0.07, th: 0.03, rim: "#8E8C87", hub: 0.015 });
      const ph = t < 0.24 ? 0 : t < 0.46 ? 1 : t < 0.92 ? 2 : 3;
      const sq = 0.5 + 0.5 * Math.sin(t * 60);
      out.act = {
        lat: { a: [1, 0.85 + 0.15 * sq, 0.6, 0.1][ph], c: "ember" },
        delt: { a: [0.45, 0.45, 0.3, 0][ph], c: "ember" },
        uarm: { a: [0.3, 0.3, 0.2, 0][ph], c: "ember" },
      };
      const el = J.el[1];
      const hip = J.hips[1];
      const cm = Math.round(Math.hypot(el[0] - hip[0], el[1] - hip[1]) * 100);
      out.guides.push({ pts: [el, hip], col: "rgba(140,200,255,.6)", dash: true, w: 1.5, top: true });
      out.track = el;
      out.labels.push({ p: el, text: `${cm} cm to hip`, col: "#8CC8FF", dx: -126, dy: 8 });
      if (ph === 1) out.rings.push({ c: E.add(J.sMid, [-0.06, -0.14, 0]), n: [1, 0, 0], r: 0.2 + 0.02 * sq, col: "#FF6A2B", a: 0.55 });
      out.read = `${cm} cm`;
      return out;
    },
  };
}

/** Guided machine squat: knees track a toe line turned out 15°, down to the depth stop. */
function squat(E: FormEngine): FormDef {
  // Tempo: 2 s down, touch the stop, 1 s up, breathe at the top.
  const S = [[0, 1.375], [0.48, 0.95], [0.56, 0.95], [0.8, 1.375], [1, 1.375]];
  const LEAN = [[0, 12], [0.48, 32], [0.56, 32], [0.8, 12], [1, 12]];
  const TOE = 15 * R;
  const STOP = 0.9;
  return {
    dur: 4.2,
    keyT: 0.52,
    ghostT: 0.52,
    v0: 1,
    target: [0.02, 0.98, 0],
    dist: 3.4,
    F: 530,
    views: [
      { n: "Side", yaw: 0, pitch: 0.08, d: 3.4 },
      { n: "¾", yaw: 0.72, pitch: 0.2, d: 3.4 },
      { n: "Front", yaw: 1.5708, pitch: 0.14, d: 3.3 },
    ],
    phases: [
      { n: "Down · 2 s", s: 0, e: 0.48 },
      { n: "Touch stop", s: 0.48, e: 0.56 },
      { n: "Up · 1 s", s: 0.56, e: 0.8 },
      { n: "Stand", s: 0.8, e: 1 },
    ],
    readLabel: "KNEE ANGLE",
    pose: (t) => {
      const out = E.newOut();
      const s = E.kf(S, t);
      const th = E.kf(LEAN, t) * R;
      const dir: V = [Math.sin(th), Math.cos(th), 0];
      const P = E.sub([0, s, 0], E.mul(dir, 0.5));
      const fd = (sd: number): V => [Math.cos(TOE), 0, Math.sin(TOE) * sd];
      const J = E.body(
        {
          pelvis: P,
          theta: th,
          headDir: [0.15, 1, 0],
          ankles: [[0.14, 0.075, -0.17], [0.14, 0.075, 0.17]],
          footDir: fd,
          // Knees track the line of the 2nd–3rd toe.
          kneePole: (sd) => [Math.cos(TOE), 0.1, Math.sin(TOE) * sd * 1.1],
          hands: [[0.15, s - 0.02, -0.27], [0.15, s - 0.02, 0.27]],
          elbowPole: (sd) => [-0.3, -1, 0.5 * sd],
        },
        out
      );
      const atStop = t >= 0.46 && t < 0.58;
      const c = s + 0.05;
      out.segs.push(
        { a: [-0.14, 0, -0.34], b: [-0.14, 2.05, -0.34], ra: 0.028, rb: 0.028, k: "eq", col: "steel" },
        { a: [-0.14, 0, 0.34], b: [-0.14, 2.05, 0.34], ra: 0.028, rb: 0.028, k: "eq", col: "steel" },
        { a: [-0.14, 2.05, -0.34], b: [-0.14, 2.05, 0.34], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [-0.14, c, -0.34], b: [-0.14, c, 0.34], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [-0.14, c, -0.2], b: [0.0, c + 0.06, -0.2], ra: 0.02, rb: 0.02, k: "eq", col: "dark" },
        { a: [-0.14, c, 0.2], b: [0.0, c + 0.06, 0.2], ra: 0.02, rb: 0.02, k: "eq", col: "dark" },
        { a: [-0.08, s + 0.09, -0.17], b: [0.08, s + 0.09, -0.17], ra: 0.045, rb: 0.045, k: "eq", col: "pad" },
        { a: [-0.08, s + 0.09, 0.17], b: [0.08, s + 0.09, 0.17], ra: 0.045, rb: 0.045, k: "eq", col: "pad" },
        { a: [0.0, c + 0.06, -0.27], b: [0.17, c - 0.07, -0.27], ra: 0.017, rb: 0.017, k: "eq", col: "dark" },
        { a: [0.0, c + 0.06, 0.27], b: [0.17, c - 0.07, 0.27], ra: 0.017, rb: 0.017, k: "eq", col: "dark" },
        { a: [-0.14, STOP - 0.04, -0.34], b: [-0.14, STOP + 0.025, -0.34], ra: 0.045, rb: 0.045, k: "eq", col: atStop ? "ember" : "emberDim" },
        { a: [-0.14, STOP - 0.04, 0.34], b: [-0.14, STOP + 0.025, 0.34], ra: 0.045, rb: 0.045, k: "eq", col: atStop ? "ember" : "emberDim" },
        { a: [0.02, 0.02, -0.38], b: [0.02, 0.02, 0.38], ra: 0.025, rb: 0.025, k: "eq", col: "dark" },
        { a: [0.34, 0.02, -0.38], b: [0.34, 0.02, 0.38], ra: 0.025, rb: 0.025, k: "eq", col: "dark" },
        { a: [-0.14, 0.02, -0.38], b: [0.34, 0.02, -0.38], ra: 0.025, rb: 0.025, k: "eq", col: "dark" },
        { a: [-0.14, 0.02, 0.38], b: [0.34, 0.02, 0.38], ra: 0.025, rb: 0.025, k: "eq", col: "dark" }
      );
      [-1, 1].forEach((sd, i) => {
        const a0: V = [0.14, 0.004, 0.17 * sd];
        out.guides.push({ pts: [a0, E.add(a0, E.mul(fd(sd), 0.5))], col: "rgba(140,200,255,.6)", dash: true, w: 1.5 });
        const kn = J.knees[i];
        out.guides.push({ pts: [[kn[0], kn[1], kn[2]], [kn[0], 0.004, kn[2]]], col: "rgba(140,200,255,.25)", dash: true, w: 1, top: true });
      });
      const ph = t < 0.48 ? 0 : t < 0.56 ? 1 : t < 0.8 ? 2 : 3;
      out.act = {
        thigh: { a: [0.6, 0.85, 1, 0.08][ph], c: "ember" },
        glute: { a: [0.45, 0.7, 0.9, 0.05][ph], c: "ember" },
      };
      if (atStop) out.rings.push({ c: [-0.14, STOP + 0.03, 0.34], n: [0, 1, 0], r: 0.09, col: "#FF6A2B", a: 0.9 });
      const kAng = Math.round(E.angle(J.hips[1], J.knees[1], J.ankles[1]));
      out.labels.push({ p: J.knees[1], text: `knee ${kAng}°`, col: "#8CC8FF", dx: 18, dy: -10 });
      if (atStop) out.labels.push({ p: [-0.14, STOP + 0.03, 0.34], text: "depth stop", col: "#FF8A55", dx: -98, dy: 12 });
      out.track = J.knees[1];
      out.read = `${kAng}°`;
      return out;
    },
  };
}

/** Rope pushdown at a high pulley: elbow pinned, rope splits, 3 s eccentric. */
function pushdown(E: FormEngine): FormDef {
  // Forearm angle from straight down: 92° = start, 6° = full lockout. Tempo: 1 s push, squeeze, 3 s back.
  const PHI = [[0, 92], [0.21, 6], [0.31, 6], [0.94, 92], [1, 92]];
  const PUL: V = [0.46, 2.04, 0];
  return {
    dur: 4.8,
    keyT: 0.25,
    ghostT: 0.25,
    v0: 0,
    target: [0.18, 1.08, 0],
    dist: 3.2,
    F: 540,
    views: [
      { n: "Side", yaw: 0, pitch: 0.1, d: 3.2 },
      { n: "¾", yaw: 0.7, pitch: 0.18, d: 3.3 },
      { n: "Front", yaw: 1.5708, pitch: 0.1, d: 3.3 },
    ],
    phases: [
      { n: "Push · 1 s", s: 0, e: 0.21 },
      { n: "Squeeze", s: 0.21, e: 0.31 },
      { n: "Back", s: 0.31, e: 0.94, count: true },
      { n: "Reset", s: 0.94, e: 1 },
    ],
    readLabel: "ELBOW ANGLE",
    pose: (t) => {
      const out = E.newOut();
      const phi = E.kf(PHI, t);
      const p = phi * R;
      let ua0: V | null = null;
      const J = E.body(
        {
          pelvis: [-0.04, 0.9, 0],
          theta: 14 * R,
          headDir: [0.12, 1, 0],
          ankles: [[0, 0.075, -0.14], [0, 0.075, 0.14]],
          footDir: (sd) => E.nrm([1, 0, 0.12 * sd]),
          kneePole: (sd) => [1, 0.1, 0.2 * sd],
          // Upper arm pinned to the ribs; only the forearm moves, and the rope splits at the bottom.
          arm: (sd, sh) => {
            const ua = E.nrm([0.14, -1, -0.06 * sd]);
            if (sd > 0) ua0 = ua;
            const el = E.add(sh, E.mul(ua, 0.29));
            const spread = (1 - phi / 92) * 0.24;
            const fdir = E.nrm([Math.sin(p), -Math.cos(p), sd * spread]);
            return { el, hand: E.add(el, E.mul(fdir, 0.27)) };
          },
        },
        out
      );
      const hm = E.mul(E.add(J.hands[0], J.hands[1]), 0.5);
      const K = E.add(hm, E.mul(E.nrm(E.sub(PUL, hm)), 0.12));
      const lift = ((92 - phi) / 92) * 0.3;
      out.segs.push(
        { a: J.hands[0], b: K, ra: 0.016, rb: 0.016, k: "eq", col: "pad" },
        { a: J.hands[1], b: K, ra: 0.016, rb: 0.016, k: "eq", col: "pad" },
        { a: K, b: PUL, ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.8)" },
        { a: [0.56, 0, 0], b: [0.56, 2.15, 0], ra: 0.05, rb: 0.05, k: "eq", col: "dark" },
        { a: [0.56, 2.1, 0], b: [0.44, 2.1, 0], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [0.56, 0, -0.28], b: [0.56, 0, 0.28], ra: 0.03, rb: 0.03, k: "eq", col: "dark" },
        { a: [0.74, 0, -0.17], b: [0.74, 1.3, -0.17], ra: 0.012, rb: 0.012, k: "eq", col: "steel" },
        { a: [0.74, 0, 0.17], b: [0.74, 1.3, 0.17], ra: 0.012, rb: 0.012, k: "eq", col: "steel" },
        { a: [PUL[0] + 0.04, 2.1, 0], b: [0.74, 2.1, 0], ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.5)" },
        { a: [0.74, 2.1, 0], b: [0.74, 0.62 + lift, 0], ra: 0.006, rb: 0.006, k: "line", col: "rgba(200,200,206,.75)" }
      );
      for (let i = 0; i < 10; i++) {
        const y = 0.08 + i * 0.05 + (i >= 8 ? lift : 0);
        out.segs.push({ a: [0.74, y, -0.15], b: [0.74, y, 0.15], ra: 0.022, rb: 0.022, k: "eq", col: i >= 8 ? "ember" : "dark" });
      }
      out.spheres.push({ c: K, r: 0.03, k: "eq", col: "dark" });
      out.discs.push({ c: PUL, r: 0.05, th: 0.03, rim: "#8E8C87", hub: 0.012 });
      const ph = t < 0.21 ? 0 : t < 0.31 ? 1 : t < 0.94 ? 2 : 3;
      const sq = 0.5 + 0.5 * Math.sin(t * 70);
      out.act = { uarm: { a: [1, 0.8 + 0.2 * sq, 0.6, 0.08][ph], c: "ember" } };
      out.rings.push({ c: J.el[1], n: ua0 || [0, -1, 0], r: 0.07, col: "#8CC8FF", a: 0.95 });
      const eAng = Math.round(E.angle(J.sh[1], J.el[1], J.hands[1]));
      out.labels.push({ p: J.el[1], text: "pinned", col: "#8CC8FF", dx: -86, dy: -12 });
      out.labels.push({ p: J.hands[1], text: `elbow ${eAng}°`, col: "#8CC8FF", dx: 18, dy: 0 });
      out.track = J.hands[1];
      out.read = `${eAng}°`;
      return out;
    },
  };
}

export interface CueCopy {
  /** Eyebrow tail after "FORM · 3D · ". */
  tag: string;
  aria: string;
  do: string[];
  avoid: string[];
}

export const FORM_DEFS: Record<FormCueId, { make: (E: FormEngine) => FormDef; copy: CueCopy }> = {
  deadlift: {
    make: deadlift,
    copy: {
      tag: "STRAPS",
      aria: "3D animation of a conventional deadlift: brace, push the floor with the bar travelling straight up over mid-foot, lock out, then hinge back down",
      do: ["Big breath, brace hard before every rep", "Bar over mid-foot, brushing the shins", "Push the floor away, hips and shoulders rise together"],
      avoid: ["Hitching the bar up the thighs on the last rep", "Rounding the lower back off the floor"],
    },
  },
  "lat-pulldown": {
    make: latPulldown,
    copy: {
      tag: "WIDE GRIP",
      aria: "3D animation of a seated wide-grip lat pulldown: elbows drive down and back toward the hips, the bar touches the upper chest, a one-second squeeze, then a two-second controlled return",
      do: ["Chest tall, slight lean back — keep it fixed", "Drive elbows to hips, bar to upper chest", "Pause 1 s, then 2 s back up"],
      avoid: ["Swinging the torso to move the weight", "Shrugging — keep the shoulders down"],
    },
  },
  squat: {
    make: squat,
    copy: {
      tag: "DEPTH STOP",
      aria: "3D animation of a guided machine squat: two seconds down until the carriage touches the depth stop, knees tracking over the second and third toe, then one second up",
      do: ["Feet mid-platform, toes out about 15°", "Knees follow the 2nd–3rd toe line", "Touch the stop, drive through the whole foot"],
      avoid: ["Riding past the depth stop", "Knees caving inward on the way up"],
    },
  },
  pushdown: {
    make: pushdown,
    copy: {
      tag: "CABLE",
      aria: "3D animation of a rope triceps pushdown: the upper arm stays pinned to the side while the forearm extends, the rope splits at the bottom, then a three-second return",
      do: ["Elbows pinned to your ribs", "Split the rope apart at the bottom", "Count 3 s on the way back up"],
      avoid: ["Elbows drifting forward", "Leaning over the stack to push with bodyweight"],
    },
  },
};
