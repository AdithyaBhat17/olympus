/**
 * Form-cue engine, ported from the Olympus Redesign canvas prototypes
 * (FormDeadlift / FormLatPulldown / FormSquat / FormPushdown).
 *
 * - A tiny perspective camera (orbit by drag, eased Side / ¾ / Front presets).
 * - Monotone-cubic keyframes: motion flows through every key, holds stay still.
 * - IK against the equipment (two-bone legs and arms with pole vectors).
 * - A 1.78 m athlete built from lofted cross-sections.
 * - Rendering: three.js (lazy-loaded) with soft shadows and muscle glow, and a
 *   2D canvas painter (painter's sort, silhouettes, ghost, trail) as the
 *   fallback when WebGL is unavailable. Overlays (guides, labels, rings, the
 *   joint trail) are always 2D on top.
 *
 * Units: metres. +X = facing, +Y = up, +Z = athlete's right.
 */

import type * as THREE from "three";

export type V = number[];

export interface Seg {
  a: V;
  b: V;
  ra: number;
  rb: number;
  k: "eq" | "line";
  col: string;
}
export interface Section {
  c: V;
  r?: number;
  A?: V;
  B?: V;
}
export interface Loft {
  tag?: string;
  secs: Section[];
  capTop?: number;
  capBot?: number;
  regions?: Record<string, [number, number]>;
}
export interface Sphere {
  c: V;
  r: number;
  k: "body" | "eq";
  tag?: string;
  col?: string;
  e?: { X: V; Y: V; Z: V; s: V };
}
export interface Disc {
  c: V;
  r: number;
  th?: number;
  rim?: string;
  hub?: number;
  alpha?: number;
  face0?: string;
  face1?: string;
}
export interface Guide {
  pts: V[];
  col: string;
  dash?: boolean;
  w?: number;
  top?: boolean;
}
export interface Label {
  p: V;
  text: string;
  col: string;
  dx?: number;
  dy?: number;
}
export interface Ring {
  c: V;
  n: V;
  r: number;
  col: string;
  a?: number;
}
export type Act = Record<string, { a: number; c: "ember" | "ice" }>;

export interface BodyOpts {
  pelvis: V;
  theta: number;
  headDir?: V;
  ankles: V[];
  footDir: (sd: number) => V;
  kneePole: (sd: number) => V;
  hands?: V[];
  elbowPole?: (sd: number) => V;
  arm?: (sd: number, sh: V) => { el: V; hand: V };
}

export interface Joints {
  P: V;
  dir: V;
  sMid: V;
  neck: V;
  hips: V[];
  knees: V[];
  ankles: V[];
  sh: V[];
  el: V[];
  hands: V[];
}

export interface Pose {
  segs: Seg[];
  lofts: Loft[];
  spheres: Sphere[];
  discs: Disc[];
  guides: Guide[];
  labels: Label[];
  rings: Ring[];
  act: Act;
  track: V;
  read: string;
  rig?: { o: BodyOpts; J: Joints; P: V; dir: V; hd: V };
}

export interface FormDef {
  dur: number;
  keyT: number;
  ghostT?: number;
  v0?: number;
  target: V;
  dist: number;
  F: number;
  floorR?: number;
  floorC?: V;
  views: Array<{ n: string; yaw: number; pitch: number; d?: number }>;
  phases: Array<{ n: string; s: number; e: number; count?: boolean }>;
  readLabel: string;
  pose: (t: number) => Pose;
}

export interface UiState {
  phase: number;
  phaseText: string;
  read: string;
  /** 0–1000 */
  prog: number;
}

type Pal = string[];
type Pt = number[]; // [x, y, z, scale]

interface LoftGeom {
  S: Array<{ q: Pt; A?: number[]; B?: number[]; r?: number }>;
  E: number[];
  nx: number;
  ny: number;
  tl: number;
  maxE: number;
  blob: boolean;
  cx: number;
  cy: number;
  mid: Pt;
  eMid: number;
}

/** Optional CC0 rigged human. Any Mixamo-style skeleton retargets. */
export const RIG_URL = "/models/athlete.glb";

const PAL: Record<string, Pal> = {
  body: ["#FFFDF8", "#E3DFD6", "#9E9990", "#45423E", "#B5582F"],
  pad: ["#5A5A61", "#38383E", "#1F1F23", "#111113", "#3A3A40"],
  steel: ["#F2F2F5", "#B0B0B8", "#5C5C64", "#222226", "#7A7A82"],
  dark: ["#4C4C53", "#303035", "#1B1B1E", "#0E0E10", "#303035"],
  ember: ["#FFD7C2", "#FF9460", "#E2541C", "#5A1E08", "#FF8A55"],
  emberDim: ["#7A4A36", "#5A2E1E", "#3A1A10", "#1E0E08", "#5A2E1E"],
  ice: ["#EAF5FF", "#A9D6FF", "#5B9BDB", "#16304D", "#8CC8FF"],
};

/* eslint-disable @typescript-eslint/no-explicit-any -- three.js scene graph is built dynamically */
export class FormEngine {
  readonly W: number;
  readonly H: number;
  readonly D: FormDef;
  private onUi: (s: UiState) => void;

  // animation
  t = 0;
  speed = 1;
  playing = true;
  reduce = false;
  private _t = 0;
  private cycles: number;
  private last = 0;
  private lastUi = 0;
  private raf = 0;
  private running = false;
  private ui: UiState = { phase: 0, phaseText: "", read: "", prog: 0 };

  // camera
  private yaw: number;
  private pitch: number;
  private dist: number;
  private tYaw: number;
  private tPitch: number;
  private tDist: number;
  private userOrbit = false;
  private drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private cam: { eye: V; f: V; r: V; u: V } = { eye: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0] };

  // precomputed
  private trail: V[] = [];
  private ghost: Pose | null;
  cur: Pose | null = null;

  // 2D
  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private sh: HTMLCanvasElement | null = null;
  private sctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;

  // 3D
  three = false;
  private glCanvas: HTMLCanvasElement | null = null;
  private T: typeof THREE | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private MAT: Record<string, any> = {};
  private SKIN: any;
  private EMB: any;
  private ICE: any;
  private UPV: any;
  private tmpV: any;
  private tmpM: any;
  private bX: any;
  private bY: any;
  private bZ: any;
  private q1: any;
  private q2: any;
  private q3: any;
  private gLofts: any[] = [];
  private gSph: any[] = [];
  private gSeg: any[] = [];
  private gDisc: any[] = [];
  private rig: {
    root: any;
    bones: Record<string, any>;
    L: { thigh: number; shin: number; uarm: number; farm: number };
    hipDrop: number;
    rest: Array<[any, any]>;
  } | null = null;
  private hi: Array<{ li: number; r?: [number, number]; tag: string; mesh: any }> = [];
  private disposed = false;

  constructor(makeDef: (E: FormEngine) => FormDef, size: { W: number; H: number }, onUi: (s: UiState) => void) {
    this.W = size.W;
    this.H = size.H;
    this.onUi = onUi;
    this.D = makeDef(this);
    this.cycles = Math.max(1, Math.round(this.D.dur / 3.4));
    const v = this.D.views[this.D.v0 || 0];
    this.yaw = this.tYaw = v.yaw;
    this.pitch = this.tPitch = v.pitch;
    this.dist = this.tDist = v.d || this.D.dist;
    for (let i = 0; i <= 120; i++) this.trail.push(this.poseAt(i / 120).track.slice());
    this.ghost = this.D.ghostT != null ? this.poseAt(this.D.ghostT) : null;
    this.ui.phaseText = this.D.phases[0].n;
  }

  /* ---- lifecycle ---------------------------------------------------------- */

  attach(overlay: HTMLCanvasElement, gl: HTMLCanvasElement | null) {
    this.cv = overlay;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    overlay.width = Math.round(this.W * dpr);
    overlay.height = Math.round(this.H * dpr);
    this.ctx = overlay.getContext("2d");
    this.sh = document.createElement("canvas");
    this.sh.width = overlay.width;
    this.sh.height = overlay.height;
    this.sctx = this.sh.getContext("2d");
    this.reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (this.reduce) {
      this.t = this.D.keyT;
      this.playing = false;
    }
    this.glCanvas = gl;
    if (gl) void this.tryThree();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.disposed = true;
    if (this.renderer) {
      this.scene?.traverse((o: any) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
        else m?.dispose?.();
      });
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
  }

  /* ---- controls ------------------------------------------------------------ */

  setPlaying(p: boolean) {
    this.playing = p;
  }
  setSpeed(s: number) {
    this.speed = s;
  }
  scrubTo(frac: number) {
    this.t = Math.min(0.999, Math.max(0, frac));
    this.playing = false;
    if (!this.running && this.ctx) this.draw();
  }
  pickView(i: number) {
    const vw = this.D.views[i];
    this.tYaw = vw.yaw;
    this.tPitch = vw.pitch;
    this.tDist = vw.d || this.D.dist;
    this.userOrbit = false;
  }
  pointerDown(x: number, y: number) {
    this.drag = { x, y, yaw: this.yaw, pitch: this.pitch };
  }
  /** Returns true once the user has orbited (to hide the hint). */
  pointerMove(x: number, y: number): boolean {
    const d = this.drag;
    if (!d) return false;
    this.yaw = d.yaw - (x - d.x) * 0.012;
    this.pitch = Math.max(-0.05, Math.min(0.75, d.pitch + (y - d.y) * 0.006));
    this.tYaw = this.yaw;
    this.tPitch = this.pitch;
    this.userOrbit = true;
    return true;
  }
  pointerUp() {
    this.drag = null;
  }

  /* ---- loop ------------------------------------------------------------------ */

  poseAt(t: number): Pose {
    this._t = t;
    return this.D.pose(t);
  }

  private frame(now: number) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const D = this.D;
    if (this.playing) this.t = (this.t + (dt * this.speed) / D.dur) % 1;
    const k = 1 - Math.exp(-dt * 4);
    if (!this.drag) {
      const sway = this.playing && !this.reduce && !this.userOrbit ? Math.sin(now * 0.0004) * 0.08 : 0;
      this.yaw += (this.tYaw + sway - this.yaw) * k;
      this.pitch += (this.tPitch - this.pitch) * k;
    }
    this.dist += (this.tDist - this.dist) * k;
    if (this.ctx) this.draw();
    if (now - this.lastUi > 100) {
      this.lastUi = now;
      this.syncUi();
    }
  }

  private syncUi() {
    const D = this.D;
    const t = this.t;
    let i = D.phases.findIndex((p) => t >= p.s && t < p.e);
    if (i < 0) i = 0;
    const p = D.phases[i];
    const phaseText = p.count ? `${p.n} · ${Math.max(1, Math.ceil((p.e - t) * D.dur))}` : p.n;
    const read = this.cur ? this.cur.read : "";
    const prog = Math.round(t * 1000);
    const u = this.ui;
    if (i !== u.phase || phaseText !== u.phaseText || read !== u.read || Math.abs(prog - u.prog) >= 5) {
      this.ui = { phase: i, phaseText, read, prog };
      this.onUi(this.ui);
    }
  }

  /* ---- math ------------------------------------------------------------------ */

  add(a: V, b: V): V {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  sub(a: V, b: V): V {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  mul(a: V, s: number): V {
    return [a[0] * s, a[1] * s, a[2] * s];
  }
  dot(a: V, b: V) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  len(a: V) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  }
  nrm(a: V): V {
    const l = this.len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  cross(a: V, b: V): V {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  /** Monotone cubic (Fritsch–Carlson): flows through every key, holds stay still, never overshoots. */
  kf(k: number[][], t: number): number {
    return monotoneCubic(k, t);
  }
  angle(a: V, b: V, c: V) {
    const u = this.nrm(this.sub(a, b));
    const v = this.nrm(this.sub(c, b));
    return (Math.acos(Math.max(-1, Math.min(1, this.dot(u, v)))) * 180) / Math.PI;
  }
  /** Two-bone IK: joint `mid` bends toward `pole`. */
  ik(a: V, target: V, l1: number, l2: number, pole: V): { mid: V; end: V } {
    const d = this.sub(target, a);
    const dist = Math.max(0.001, Math.min(this.len(d), (l1 + l2) * 0.999));
    const dir = this.nrm(d);
    const end = this.add(a, this.mul(dir, dist));
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = this.nrm(this.sub(pole, this.mul(dir, this.dot(pole, dir))));
    return { mid: this.add(this.add(a, this.mul(dir, x)), this.mul(p, h)), end };
  }
  newOut(): Pose {
    return { segs: [], lofts: [], spheres: [], discs: [], guides: [], labels: [], rings: [], act: {}, track: [0, 0, 0], read: "" };
  }

  /* ---- anatomy: 1.78 m athlete built from lofted cross-sections ------------- */

  body(o: BodyOpts, out: Pose): Joints {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- mirrors the defs, which call E.add/E.mul
    const E = this;
    const P = o.pelvis;
    const th = o.theta;
    const LAT: V = [0, 0, 1];
    const UP: V = [0, 1, 0];
    const dir: V = [Math.sin(th), Math.cos(th), 0];
    const fwd: V = [Math.cos(th), -Math.sin(th), 0];
    const br = Math.sin(this._t * 6.2832 * this.cycles);
    const sMid = E.add(P, E.mul(dir, 0.5));
    const neck = E.add(P, E.mul(dir, 0.57));
    const hd = E.nrm(E.add(E.mul(dir, 0.6), E.mul(E.nrm(o.headDir || UP), 0.4)));
    const hf = E.nrm(E.cross(hd, LAT));
    const J: Joints = { P, dir, sMid, neck, hips: [], knees: [], ankles: [], sh: [], el: [], hands: [] };
    const limb = (a: V, b: V, prof: number[], tag: string) => {
      const n = prof.length;
      out.lofts.push({ tag, secs: prof.map((r, i) => ({ c: E.add(a, E.mul(E.sub(b, a), i / (n - 1))), r })) });
    };
    // Torso: [height along spine, half-width, half-depth, forward offset].
    const TOR = [
      [-0.05, 0.15, 0.1, -0.035],
      [0.04, 0.16, 0.112, -0.015],
      [0.13, 0.15, 0.104, 0],
      [0.22, 0.136, 0.098, 0.006],
      [0.31, 0.152, 0.11, 0.02],
      [0.4, 0.17, 0.118, 0.03],
      [0.48, 0.188, 0.104, 0.008],
      [0.555, 0.118, 0.072, -0.012],
    ];
    const TS = TOR.map((s, i) => {
      const g = i === 4 || i === 5 ? 1 + 0.03 * br : 1;
      return { c: E.add(E.add(P, E.mul(dir, s[0])), E.mul(fwd, s[3])), A: E.mul(LAT, s[1] * g), B: E.mul(fwd, s[2] * g) };
    });
    out.lofts.push({ tag: "torso", secs: TS, capTop: 0.3, capBot: 0.55, regions: { glute: [0, 2], core: [1, 4], lat: [3, 6] } });
    out.spheres.push({
      c: E.add(E.add(neck, E.mul(hd, 0.118)), E.mul(hf, 0.012)),
      r: 0.1,
      k: "body",
      tag: "head",
      e: { X: hf, Y: hd, Z: E.cross(hf, hd), s: [0.1, 0.121, 0.087] },
    });
    limb(E.add(sMid, E.mul(dir, 0.03)), E.add(neck, E.mul(hd, 0.07)), [0.056, 0.05, 0.05], "neck");
    [-1, 1].forEach((sd, i) => {
      const hip = E.add(P, [0, 0, 0.095 * sd]);
      const ank = o.ankles[i];
      const leg = E.ik(hip, ank, 0.44, 0.42, o.kneePole(sd));
      const fd = o.footDir(sd);
      const sh = E.add(sMid, [0, -0.02, 0.185 * sd]);
      let el: V;
      let hand: V;
      if (o.arm) {
        const r = o.arm(sd, sh);
        el = r.el;
        hand = r.hand;
      } else {
        const a = E.ik(sh, o.hands![i], 0.29, 0.27, o.elbowPole!(sd));
        el = a.mid;
        hand = a.end;
      }
      J.hips.push(hip);
      J.knees.push(leg.mid);
      J.ankles.push(leg.end);
      J.sh.push(sh);
      J.el.push(el);
      J.hands.push(hand);
      limb(hip, leg.mid, [0.088, 0.09, 0.08, 0.066, 0.054], "thigh");
      limb(leg.mid, leg.end, [0.052, 0.06, 0.051, 0.038, 0.032], "shin");
      const fl = E.nrm(E.cross(fd, UP));
      const heel = E.add([ank[0], 0.045, ank[2]], E.mul(fd, -0.055));
      const toe = E.add([ank[0], 0.028, ank[2]], E.mul(fd, 0.175));
      const FW = [
        [0.04, 0.04],
        [0.046, 0.036],
        [0.046, 0.027],
        [0.036, 0.019],
      ];
      out.lofts.push({
        tag: "foot",
        secs: FW.map((w, j) => ({ c: E.add(heel, E.mul(E.sub(toe, heel), j / 3)), A: E.mul(fl, w[0]), B: E.mul(UP, w[1]) })),
      });
      limb(sh, el, [0.055, 0.053, 0.047, 0.04, 0.036], "uarm");
      limb(el, hand, [0.04, 0.043, 0.037, 0.03, 0.026], "farm");
      const fdir = E.nrm(E.sub(hand, el));
      limb(E.sub(hand, E.mul(fdir, 0.015)), E.add(hand, E.mul(fdir, 0.075)), [0.03, 0.036, 0.034, 0.025], "hand");
      out.spheres.push({ c: E.add(sh, E.mul(fwd, 0.005)), r: 0.06, k: "body", tag: "delt" });
    });
    out.rig = { o, J, P, dir, hd };
    return J;
  }

  /* ---- three.js layer --------------------------------------------------------- */

  private async tryThree() {
    if (this.three || !this.glCanvas) return;
    try {
      // Probe first: no WebGL → stay on the 2D painter.
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;
      const T = await import("three");
      if (this.disposed) return;
      this.init3D(T);
      void this.loadRig();
    } catch {
      this.three = false;
    }
  }

  private init3D(T: typeof THREE) {
    const W = this.W;
    const H = this.H;
    const D = this.D;
    const r = new T.WebGLRenderer({ canvas: this.glCanvas!, antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(W, H, false);
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera((2 * Math.atan(H / 2 / D.F) * 180) / Math.PI, W / H, 0.05, 60);
    this.T = T;
    this.renderer = r;
    this.scene = scene;
    this.camera = cam;
    this.UPV = new T.Vector3(0, 1, 0);
    this.tmpV = new T.Vector3();
    this.tmpM = new T.Matrix4();
    this.bX = new T.Vector3();
    this.bY = new T.Vector3();
    this.bZ = new T.Vector3();
    this.SKIN = new T.Color(0xece7de);
    this.EMB = new T.Color(0xff6a2b);
    this.ICE = new T.Color(0x8cc8ff);
    // Physically based light units (r155+): scale the prototype's intensities by π.
    const PI = Math.PI;
    scene.add(new T.HemisphereLight(0xfff3e6, 0x16161b, 0.75 * PI));
    const key = new T.DirectionalLight(0xffffff, 1.7 * PI);
    key.position.set(D.target[0] + 1.6, 3.8, 2.4);
    key.target.position.set(D.target[0], 0.6, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -2.2;
    sc.right = 2.2;
    sc.top = 2.8;
    sc.bottom = -1.6;
    sc.near = 0.5;
    sc.far = 10;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    scene.add(key);
    scene.add(key.target);
    const rim = new T.DirectionalLight(0xff7a3c, 1.5 * PI);
    rim.position.set(-2.4, 2.4, -2.4);
    scene.add(rim);
    const fill = new T.DirectionalLight(0x8cc8ff, 0.5 * PI);
    fill.position.set(-1.6, 0.9, 2.8);
    scene.add(fill);
    // Floor: soft radial glow, a grid, and a shadow catcher.
    const R = D.floorR || 1.3;
    const C = D.floorC || [0, 0, 0];
    const fc = document.createElement("canvas");
    fc.width = fc.height = 256;
    const fx = fc.getContext("2d")!;
    const fg = fx.createRadialGradient(128, 128, 0, 128, 128, 128);
    fg.addColorStop(0, "rgba(60,60,68,1)");
    fg.addColorStop(0.55, "rgba(34,34,40,.75)");
    fg.addColorStop(1, "rgba(20,20,22,0)");
    fx.fillStyle = fg;
    fx.fillRect(0, 0, 256, 256);
    const ftex = new T.CanvasTexture(fc);
    ftex.colorSpace = T.SRGBColorSpace;
    const floor = new T.Mesh(new T.CircleGeometry(R * 1.3, 64), new T.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(C[0], 0, C[2]);
    scene.add(floor);
    const grid = new T.GridHelper(R * 2, Math.round(R * 8), 0x3a3a42, 0x2c2c32);
    const gm = grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.22;
    gm.depthWrite = false;
    grid.position.set(C[0], 0.001, C[2]);
    scene.add(grid);
    const catcher = new T.Mesh(new T.CircleGeometry(R * 1.3, 64), new T.ShadowMaterial({ opacity: 0.5 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(C[0], 0.002, C[2]);
    catcher.receiveShadow = true;
    scene.add(catcher);
    const M = (o: THREE.MeshStandardMaterialParameters) => new T.MeshStandardMaterial(o);
    this.MAT = {
      pad: M({ color: 0x2c2c32, roughness: 0.85 }),
      steel: M({ color: 0xc9c9d2, metalness: 0.85, roughness: 0.28 }),
      dark: M({ color: 0x25252a, roughness: 0.55, metalness: 0.35 }),
      ember: M({ color: 0xff6a2b, emissive: 0xff5a1a, emissiveIntensity: 0.7, roughness: 0.4 }),
      emberDim: M({ color: 0x5a2e1e, roughness: 0.7 }),
      plate: M({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.25, transparent: true, opacity: 0.62, depthWrite: false }),
      rim: M({ color: 0xff6a2b, emissive: 0xff5a1a, emissiveIntensity: 0.9, roughness: 0.4 }),
      line: new T.MeshBasicMaterial({ color: 0xc8c8ce }),
      ghost: new T.MeshBasicMaterial({ color: 0x8cc8ff, transparent: true, opacity: 0.1, depthWrite: false }),
    };
    const skin = () =>
      new T.MeshPhysicalMaterial({
        color: 0xece7de,
        roughness: 0.5,
        clearcoat: 0.3,
        clearcoatRoughness: 0.5,
        sheen: 0.6,
        sheenColor: new T.Color(0xffe2cf),
        sheenRoughness: 0.5,
      });
    const sphG = new T.SphereGeometry(1, 32, 22);
    const cylG = new T.CylinderGeometry(1, 1, 1, 20, 1);
    const lineG = new T.CylinderGeometry(1, 1, 1, 6, 1);
    const p0 = this.poseAt(this.t);
    this.gLofts = p0.lofts.map((L) => this.makeLoft(L, skin(), true));
    this.gSph = p0.spheres.map((s) => {
      const m = new T.Mesh(sphG, s.k === "body" ? skin() : this.MAT[s.col || "dark"]);
      m.castShadow = true;
      scene.add(m);
      return m;
    });
    this.gSeg = p0.segs.map((s) => {
      const ln = s.k === "line";
      const m = new T.Mesh(ln ? lineG : cylG, ln ? this.MAT.line : this.MAT[s.col || "dark"]);
      m.castShadow = !ln;
      m.receiveShadow = !ln;
      scene.add(m);
      return m;
    });
    this.gDisc = p0.discs.map((d) => {
      const g = new T.Group();
      const th = d.th || 0.04;
      const body = new T.Mesh(
        new T.CylinderGeometry(d.r, d.r, th, 48),
        d.rim && d.r > 0.1 ? this.MAT.plate : M({ color: new T.Color(d.face0 || "#4A4A52"), metalness: 0.6, roughness: 0.35 })
      );
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      g.add(body);
      if (d.rim)
        [-1, 1].forEach((sd) => {
          const ring = new T.Mesh(new T.TorusGeometry(d.r - 0.004, 0.006, 8, 64), this.MAT.rim);
          ring.position.z = (sd * th) / 2;
          g.add(ring);
        });
      scene.add(g);
      return g;
    });
    if (this.ghost) {
      this.ghost.lofts.forEach((L) => {
        const m = this.makeLoft(L, this.MAT.ghost, false);
        this.poseLoft(m, L);
      });
      this.ghost.spheres.forEach((s) => {
        if (s.k !== "body") return;
        const m = new T.Mesh(sphG, this.MAT.ghost);
        this.poseSphere(m, s);
        scene.add(m);
      });
    }
    this.three = true;
  }

  private makeLoft(L: Loft, mat: any, shadow: boolean) {
    const T = this.T!;
    const s = L.secs;
    const c0 = s[0].c;
    const cn = s[s.length - 1].c;
    const len0 = this.len(this.sub(cn, c0)) || 1e-3;
    const ax = this.nrm(this.sub(cn, c0));
    const w = (sc: Section) => (sc.A ? this.len(sc.A) : sc.r!);
    const core = s.map((sc) => new T.Vector2(w(sc), this.dot(this.sub(sc.c, c0), ax)));
    const smooth = core.length > 2 ? new T.SplineCurve(core).getPoints(core.length * 6) : core;
    const r0 = w(s[0]);
    const rn = w(s[s.length - 1]);
    const pts: THREE.Vector2[] = [];
    const cb = L.capBot || 1;
    const ct = L.capTop || 1;
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + ((k / 8) * Math.PI) / 2;
      pts.push(new T.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a) * cb));
    }
    smooth.forEach((p) => pts.push(new T.Vector2(Math.max(1e-4, p.x), p.y)));
    for (let k = 1; k <= 8; k++) {
      const a = ((k / 8) * Math.PI) / 2;
      pts.push(new T.Vector2(Math.max(1e-4, rn * Math.cos(a)), len0 + rn * Math.sin(a) * ct));
    }
    const geo = new T.LatheGeometry(pts, 36);
    geo.computeVertexNormals();
    const ratio = s[0].A ? s.reduce((acc, sc) => acc + this.len(sc.B!) / (this.len(sc.A!) || 1), 0) / s.length : 1;
    const m = new T.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    m.userData = { len0, ratio, ell: !!s[0].A };
    if (L.regions && shadow) {
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = this.SKIN.r;
        col[i * 3 + 1] = this.SKIN.g;
        col[i * 3 + 2] = this.SKIN.b;
      }
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      mat.vertexColors = true;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      m.userData.regions = Object.keys(L.regions).map((tag) => ({
        tag,
        y0: core[L.regions![tag][0]].y,
        y1: core[L.regions![tag][1]].y,
      }));
    }
    this.scene!.add(m);
    return m;
  }

  private poseLoft(m: any, L: Loft) {
    const s = L.secs;
    const c0 = s[0].c;
    const cn = s[s.length - 1].c;
    const u = m.userData;
    const axv = this.sub(cn, c0);
    const len = this.len(axv) || 1e-3;
    const Y = this.nrm(axv);
    let X: V;
    if (u.ell) X = this.nrm(this.sub(s[0].B!, this.mul(Y, this.dot(s[0].B!, Y))));
    else X = this.nrm(this.cross(Y, Math.abs(Y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const Z = this.cross(X, Y);
    const k = len / u.len0;
    const q = u.ratio;
    m.matrix.set(X[0] * q, Y[0] * k, Z[0], c0[0], X[1] * q, Y[1] * k, Z[1], c0[1], X[2] * q, Y[2] * k, Z[2], c0[2], 0, 0, 0, 1);
    m.matrixWorldNeedsUpdate = true;
  }

  /* ---- rigged athlete: a Mixamo-style skeleton retargeted onto the IK pose --- */

  private async loadRig() {
    const T = this.T;
    if (!T) return;
    try {
      const head = await fetch(RIG_URL, { method: "HEAD" });
      if (!head.ok) return; // No model shipped: the lofted mannequin stays.
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const g = await new GLTFLoader().loadAsync(RIG_URL);
      if (this.disposed) return;
      this.initRig(g.scene);
    } catch {
      this.rig = null;
    }
  }

  private initRig(root: any) {
    const T = this.T!;
    const bones: Record<string, any> = {};
    const body = new T.MeshPhysicalMaterial({
      color: 0xebe6dd,
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      sheen: 0.5,
      sheenColor: new T.Color(0xffe2cf),
      sheenRoughness: 0.5,
    });
    const joints = new T.MeshStandardMaterial({ color: 0x2b2b31, roughness: 0.38, metalness: 0.45 });
    root.traverse((o: any) => {
      if (o.isBone) bones[o.name.replace(/^mixamorig:?/, "").replace(/^DEF[-_]/, "")] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = /joint/i.test(o.name) ? joints : body;
      }
    });
    const need = [
      "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
      "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
      "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand",
    ];
    if (need.some((n) => !bones[n])) return;
    root.rotation.y = Math.PI / 2; // Mixamo rigs face +Z; our athlete faces +X.
    this.scene!.add(root);
    root.updateMatrixWorld(true);
    const d = (a: string, b: string) => this.len(this.sub(this.wpos(bones[a]), this.wpos(bones[b])));
    const L = {
      thigh: d("LeftUpLeg", "LeftLeg"),
      shin: d("LeftLeg", "LeftFoot"),
      uarm: d("LeftArm", "LeftForeArm"),
      farm: d("LeftForeArm", "LeftHand"),
    };
    const hipDrop = this.wpos(bones.Hips)[1] - this.wpos(bones.LeftUpLeg)[1];
    this.q1 = new T.Quaternion();
    this.q2 = new T.Quaternion();
    this.q3 = new T.Quaternion();
    this.rig = { root, bones, L, hipDrop, rest: Object.keys(bones).map((k) => [bones[k], bones[k].quaternion.clone()]) };
    // The lofted body steps aside; its limbs return as X-ray muscle glow.
    this.gLofts.forEach((m) => {
      m.visible = false;
    });
    this.gSph.forEach((m, i) => {
      if (this.cur && this.cur.spheres[i] && this.cur.spheres[i].k === "body") m.visible = false;
    });
    const p0 = this.cur || this.poseAt(this.t);
    const glow = () =>
      new T.MeshBasicMaterial({ color: 0xff6a2b, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, depthTest: false });
    this.hi = [];
    p0.lofts.forEach((Lf, li) => {
      if (Lf.regions)
        Object.keys(Lf.regions).forEach((tag) => {
          const r = Lf.regions![tag];
          this.hi.push({ li, r, tag, mesh: this.makeLoft({ secs: Lf.secs.slice(r[0], r[1] + 1) }, glow(), false) });
        });
      else if (Lf.tag && ["thigh", "uarm", "shin", "farm"].includes(Lf.tag))
        this.hi.push({ li, tag: Lf.tag, mesh: this.makeLoft(Lf, glow(), false) });
    });
  }

  private wposV(b: any) {
    b.updateWorldMatrix(true, false);
    return new this.T!.Vector3().setFromMatrixPosition(b.matrixWorld);
  }
  private wpos(b: any): V {
    const v = this.wposV(b);
    return [v.x, v.y, v.z];
  }
  /** Rotate `bone` so its child points along `dir` (world space). */
  private aim(bone: any, child: any, dir: V) {
    const T = this.T!;
    const cur = this.wposV(child).sub(this.wposV(bone));
    const tgt = new T.Vector3(dir[0], dir[1], dir[2]);
    if (cur.lengthSq() < 1e-10 || tgt.lengthSq() < 1e-10) return;
    cur.normalize();
    tgt.normalize();
    const dq = this.q1.setFromUnitVectors(cur, tgt);
    const bw = bone.getWorldQuaternion(this.q2);
    const pw = bone.parent.getWorldQuaternion(this.q3);
    bone.quaternion.copy(pw.invert().multiply(dq.multiply(bw)));
    bone.updateMatrixWorld(true);
  }

  private rigPose(pose: Pose) {
    const R = this.rig!;
    const B = R.bones;
    const rg = pose.rig;
    if (!rg) return;
    R.rest.forEach((e) => e[0].quaternion.copy(e[1]));
    R.root.updateMatrixWorld(true);
    const hp = this.add(rg.P, this.mul(rg.dir, R.hipDrop));
    B.Hips.position.copy(B.Hips.parent.worldToLocal(new this.T!.Vector3(hp[0], hp[1], hp[2])));
    B.Hips.updateMatrixWorld(true);
    this.aim(B.Hips, B.Spine, rg.dir);
    this.aim(B.Spine, B.Spine1, rg.dir);
    this.aim(B.Spine1, B.Spine2, rg.dir);
    this.aim(B.Spine2, B.Neck, rg.dir);
    this.aim(B.Neck, B.Head, rg.hd);
    ["Left", "Right"].forEach((s, i) => {
      const sd = i ? 1 : -1;
      const o = rg.o;
      const J = rg.J;
      const hipW = this.wpos(B[s + "UpLeg"]);
      const leg = this.ik(hipW, o.ankles[i], R.L.thigh, R.L.shin, o.kneePole(sd));
      this.aim(B[s + "UpLeg"], B[s + "Leg"], this.sub(leg.mid, hipW));
      this.aim(B[s + "Leg"], B[s + "Foot"], this.sub(leg.end, leg.mid));
      const fd = o.footDir(sd);
      this.aim(B[s + "Foot"], B[s + "ToeBase"], [fd[0] * 0.13, -0.075, fd[2] * 0.13]);
      const shW = this.wpos(B[s + "Arm"]);
      let el: V;
      let hand: V;
      if (o.arm) {
        const r = o.arm(sd, shW);
        el = r.el;
        hand = r.hand;
      } else {
        const a = this.ik(shW, o.hands![i], R.L.uarm, R.L.farm + 0.06, o.elbowPole!(sd));
        el = a.mid;
        hand = a.end;
      }
      this.aim(B[s + "Arm"], B[s + "ForeArm"], this.sub(el, shW));
      this.aim(B[s + "ForeArm"], B[s + "Hand"], this.sub(hand, el));
      if (B[s + "HandMiddle1"]) this.aim(B[s + "Hand"], B[s + "HandMiddle1"], this.sub(hand, el));
      // Keep the overlay glued to the rig's real joints.
      const put = (dst: V | undefined, src: V) => {
        if (dst) {
          dst[0] = src[0];
          dst[1] = src[1];
          dst[2] = src[2];
        }
      };
      put(J.knees[i], leg.mid);
      put(J.el[i], el);
      put(J.hands[i], hand);
      put(J.sh[i], shW);
      put(J.hips[i], hipW);
    });
  }

  private poseHighlights(pose: Pose, act: Act) {
    this.hi.forEach((h) => {
      const Lf = pose.lofts[h.li];
      if (!Lf) return;
      const a = act[h.tag];
      const on = !!(a && a.a > 0.02);
      h.mesh.visible = on;
      if (!on) return;
      this.poseLoft(h.mesh, h.r ? { secs: Lf.secs.slice(h.r[0], h.r[1] + 1) } : Lf);
      h.mesh.material.color.copy(a.c === "ice" ? this.ICE : this.EMB);
      h.mesh.material.opacity = Math.min(1, a.a) * 0.34;
    });
  }

  private poseSphere(m: any, s: Sphere) {
    m.position.set(s.c[0], s.c[1], s.c[2]);
    if (s.e) {
      this.bX.set(s.e.X[0], s.e.X[1], s.e.X[2]);
      this.bY.set(s.e.Y[0], s.e.Y[1], s.e.Y[2]);
      this.bZ.set(s.e.Z[0], s.e.Z[1], s.e.Z[2]);
      m.quaternion.setFromRotationMatrix(this.tmpM.makeBasis(this.bX, this.bY, this.bZ));
      m.scale.set(s.e.s[0], s.e.s[1], s.e.s[2]);
    } else m.scale.setScalar(s.r);
  }

  private paintRegions(m: any, act: Act) {
    const u = m.userData;
    const live = (u.regions as Array<{ tag: string; y0: number; y1: number }>)
      .map((r) => ({ r, a: act[r.tag] }))
      .filter((x) => x.a && x.a.a > 0.02);
    const key = live.map((x) => x.r.tag + x.a.a.toFixed(2) + x.a.c).join("|");
    if (key === u.lastKey) return;
    u.lastKey = key;
    const pos = m.geometry.attributes.position;
    const col = m.geometry.attributes.color;
    const S = this.SKIN;
    const f = 0.06;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      let best = 0;
      let bc = this.EMB;
      live.forEach((x) => {
        const w = Math.max(0, Math.min(1, (y - x.r.y0 + f) / (2 * f), (x.r.y1 + f - y) / (2 * f)));
        const v = w * Math.min(1, x.a.a);
        if (v > best) {
          best = v;
          bc = x.a.c === "ice" ? this.ICE : this.EMB;
        }
      });
      const k = best * 0.66;
      col.setXYZ(i, S.r + (bc.r - S.r) * k, S.g + (bc.g - S.g) * k, S.b + (bc.b - S.b) * k);
    }
    col.needsUpdate = true;
  }

  private poseSeg(m: any, s: Seg) {
    const d = this.sub(s.b, s.a);
    const L = this.len(d) || 1e-4;
    const mid = this.mul(this.add(s.a, s.b), 0.5);
    m.position.set(mid[0], mid[1], mid[2]);
    this.tmpV.set(d[0] / L, d[1] / L, d[2] / L);
    m.quaternion.setFromUnitVectors(this.UPV, this.tmpV);
    const r = s.k === "line" ? Math.max(0.004, s.ra) : (s.ra + s.rb) / 2;
    m.scale.set(r, L, r);
    if (s.k !== "line") {
      const want = this.MAT[s.col || "dark"];
      if (want && m.material !== want) m.material = want;
    }
  }

  private render3D(pose: Pose) {
    const act = pose.act || {};
    const tint = (m: any, tag?: string) => {
      const a = tag ? act[tag] : undefined;
      const mat = m.material;
      if (a && a.a > 0.02) {
        const c = a.c === "ice" ? this.ICE : this.EMB;
        mat.color.copy(this.SKIN).lerp(c, Math.min(1, a.a) * 0.62);
        mat.emissive.copy(c);
        mat.emissiveIntensity = a.a * 0.5;
      } else {
        mat.color.copy(this.SKIN);
        mat.emissiveIntensity = 0;
      }
    };
    if (this.rig) {
      this.rigPose(pose);
      this.poseHighlights(pose, act);
    } else
      pose.lofts.forEach((L, i) => {
        const m = this.gLofts[i];
        if (!m) return;
        this.poseLoft(m, L);
        if (m.userData.regions) this.paintRegions(m, act);
        else tint(m, L.tag);
      });
    pose.spheres.forEach((s, i) => {
      const m = this.gSph[i];
      if (!m || (this.rig && s.k === "body")) return;
      this.poseSphere(m, s);
      if (s.k === "body") tint(m, s.tag);
    });
    pose.segs.forEach((s, i) => {
      const m = this.gSeg[i];
      if (m) this.poseSeg(m, s);
    });
    pose.discs.forEach((d, i) => {
      const g = this.gDisc[i];
      if (g) g.position.set(d.c[0], d.c[1], d.c[2]);
    });
    const c = this.cam;
    const T0 = this.D.target;
    this.camera!.position.set(c.eye[0], c.eye[1], c.eye[2]);
    this.camera!.lookAt(T0[0], T0[1], T0[2]);
    this.renderer!.render(this.scene!, this.camera!);
  }

  private drawOverlay(pose: Pose) {
    const ctx = this.ctx!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    pose.guides.forEach((g) => this.drawGuide(ctx, g));
    this.drawGuide(ctx, { pts: this.trail, col: "rgba(140,200,255,.5)", dash: true, w: 1.6 });
    this.drawTrackDot(ctx, pose.track);
    pose.rings.forEach((r) => this.drawRing(ctx, r));
    pose.labels.forEach((l) => this.drawLabel(ctx, l));
  }

  /* ---- camera ---------------------------------------------------------------- */

  private setCam() {
    const T = this.D.target;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const eye: V = [T[0] + this.dist * cp * sy, T[1] + this.dist * sp, T[2] + this.dist * cp * cy];
    const f = this.nrm(this.sub(T, eye));
    const r = this.nrm(this.cross(f, [0, 1, 0]));
    const u = this.cross(r, f);
    this.cam = { eye, f, r, u };
  }

  /** Project to screen: [x, y, depth, px-per-metre]. */
  private P(p: V): Pt {
    const c = this.cam;
    const d = this.sub(p, c.eye);
    const z = Math.max(0.1, this.dot(d, c.f));
    const s = this.D.F / z;
    return [this.W / 2 + this.dot(d, c.r) * s, this.H / 2 - this.dot(d, c.u) * s, z, s];
  }

  /* ---- 2D drawing -------------------------------------------------------------- */

  private poly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  private rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  private lightGrad(ctx: CanvasRenderingContext2D, mx: number, my: number, nx: number, ny: number, rm: number, pal: Pal) {
    if (nx * -0.55 + ny * -0.83 < 0) {
      nx = -nx;
      ny = -ny;
    }
    const g = ctx.createLinearGradient(mx + nx * rm, my + ny * rm, mx - nx * rm, my - ny * rm);
    const st = [0, 0.3, 0.7, 0.92, 1];
    for (let i = 0; i < 5; i++) g.addColorStop(st[i], pal[i]);
    return g;
  }
  private cap(ctx: CanvasRenderingContext2D, A: Pt, B: Pt, r1: number, r2: number, pal: Pal | null, flat?: string) {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const L = Math.hypot(dx, dy);
    ctx.fillStyle =
      flat ||
      this.lightGrad(ctx, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, L > 0.001 ? -dy / L : -0.55, L > 0.001 ? dx / L : -0.83, Math.max(1, (r1 + r2) / 2), pal!);
    if (L < Math.abs(r1 - r2) + 0.5) {
      const big = r1 >= r2 ? A : B;
      ctx.beginPath();
      ctx.arc(big[0], big[1], Math.max(r1, r2), 0, 6.2832);
      ctx.fill();
      return;
    }
    const nx2 = -dy / L;
    const ny2 = dx / L;
    ctx.beginPath();
    ctx.moveTo(A[0] + nx2 * r1, A[1] + ny2 * r1);
    ctx.lineTo(B[0] + nx2 * r2, B[1] + ny2 * r2);
    ctx.lineTo(B[0] - nx2 * r2, B[1] - ny2 * r2);
    ctx.lineTo(A[0] - nx2 * r1, A[1] - ny2 * r1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(A[0], A[1], r1, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(B[0], B[1], r2, 0, 6.2832);
    ctx.fill();
  }
  /** A loft's screen outline is each section's support width, splined. */
  private loftGeom(secs: Section[], G?: (p: V) => V): LoftGeom {
    const g = G || ((p: V) => p);
    const S = secs.map((sc) => {
      const c = g(sc.c);
      const q = this.P(c);
      if (sc.A) {
        const qa = this.P(g(this.add(sc.c, sc.A)));
        const qb = this.P(g(this.add(sc.c, sc.B!)));
        return { q, A: [qa[0] - q[0], qa[1] - q[1]], B: [qb[0] - q[0], qb[1] - q[1]] };
      }
      return { q, r: sc.r! * q[3] };
    });
    const a = S[0].q;
    const b = S[S.length - 1].q;
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-3) {
      tx = 0;
      ty = 1;
    } else {
      tx /= tl;
      ty /= tl;
    }
    const nx = -ty;
    const ny = tx;
    const E = S.map((s) => Math.max(0.5, s.A ? Math.hypot(s.A[0] * nx + s.A[1] * ny, s.B![0] * nx + s.B![1] * ny) : s.r!));
    const maxE = Math.max(...E);
    const mi = Math.floor(S.length / 2);
    return { S, E, nx, ny, tl, maxE, blob: tl < maxE * 0.6, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, mid: S[mi].q, eMid: E[mi] };
  }
  private fillLoft(ctx: CanvasRenderingContext2D, g: LoftGeom, pal: Pal | null, flat?: string) {
    if (g.blob) {
      const R = g.maxE + g.tl / 2;
      ctx.fillStyle = flat || this.lightGrad(ctx, g.cx, g.cy, -0.55, -0.83, R, pal!);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, R, 0, 6.2832);
      ctx.fill();
      return;
    }
    ctx.fillStyle = flat || this.lightGrad(ctx, g.mid[0], g.mid[1], g.nx, g.ny, Math.max(1, g.eMid), pal!);
    const n = g.S.length;
    const ang = Math.atan2(g.ny, g.nx);
    const L = g.S.map((s, i) => [s.q[0] + g.nx * g.E[i], s.q[1] + g.ny * g.E[i]]);
    const Rr = g.S.map((s, i) => [s.q[0] - g.nx * g.E[i], s.q[1] - g.ny * g.E[i]]);
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
    ctx.lineTo(L[n - 1][0], L[n - 1][1]);
    ctx.arc(g.S[n - 1].q[0], g.S[n - 1].q[1], g.E[n - 1], ang, ang + Math.PI, true);
    for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(Rr[i][0], Rr[i][1], (Rr[i][0] + Rr[i - 1][0]) / 2, (Rr[i][1] + Rr[i - 1][1]) / 2);
    ctx.lineTo(Rr[0][0], Rr[0][1]);
    ctx.arc(g.S[0].q[0], g.S[0].q[1], g.E[0], ang + Math.PI, ang, true);
    ctx.closePath();
    ctx.fill();
  }
  private sheen(ctx: CanvasRenderingContext2D, g: LoftGeom) {
    if (g.blob || g.S.length < 3) return;
    let nx = g.nx;
    let ny = g.ny;
    if (nx * -0.55 + ny * -0.83 < 0) {
      nx = -nx;
      ny = -ny;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, g.eMid * 0.22);
    ctx.beginPath();
    for (let i = 1; i < g.S.length - 1; i++) {
      const x = g.S[i].q[0] + nx * g.E[i] * 0.52;
      const y = g.S[i].q[1] + ny * g.E[i] * 0.52;
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  private glowOverlay(ctx: CanvasRenderingContext2D, g: LoftGeom, m: { a: number; c: string }) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.a);
    ctx.shadowColor = m.c === "ice" ? "rgba(140,200,255,.85)" : "rgba(255,106,43,.85)";
    ctx.shadowBlur = 18 * m.a;
    this.fillLoft(ctx, g, PAL[m.c === "ice" ? "ice" : "ember"]);
    ctx.restore();
  }
  private drawLoft(ctx: CanvasRenderingContext2D, L: Loft, act: Act) {
    const g = this.loftGeom(L.secs);
    this.fillLoft(ctx, g, PAL.body);
    const m = L.tag ? act[L.tag] : null;
    if (m && m.a > 0.02) this.glowOverlay(ctx, g, m);
    if (L.regions)
      Object.keys(L.regions).forEach((tag) => {
        const mm = act[tag];
        if (!mm || mm.a <= 0.02) return;
        const r = L.regions![tag];
        this.glowOverlay(ctx, this.loftGeom(L.secs.slice(r[0], r[1] + 1)), mm);
      });
    this.sheen(ctx, g);
  }
  private drawSeg(ctx: CanvasRenderingContext2D, s: Seg, A: Pt, B: Pt) {
    if (s.k === "line") {
      ctx.save();
      ctx.strokeStyle = s.col;
      ctx.lineWidth = Math.max(1, s.ra * A[3]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0], B[1]);
      ctx.stroke();
      ctx.restore();
      return;
    }
    this.cap(ctx, A, B, s.ra * A[3], s.rb * B[3], PAL[s.col || "dark"]);
  }
  private drawSphere(ctx: CanvasRenderingContext2D, s: Sphere, C: Pt, act: Act) {
    const r = s.r * C[3];
    const pal = s.k === "body" ? PAL.body : PAL[s.col || "dark"];
    const paint = (p: Pal) => {
      const g = ctx.createRadialGradient(C[0] - r * 0.35, C[1] - r * 0.4, r * 0.1, C[0], C[1], r);
      g.addColorStop(0, p[0]);
      g.addColorStop(0.45, p[1]);
      g.addColorStop(0.86, p[2]);
      g.addColorStop(1, p[3]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(C[0], C[1], r, 0, 6.2832);
      ctx.fill();
    };
    paint(pal);
    const m = s.k === "body" && s.tag ? act[s.tag] : null;
    if (m && m.a > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, m.a);
      ctx.shadowColor = "rgba(255,106,43,.85)";
      ctx.shadowBlur = 14 * m.a;
      paint(PAL[m.c === "ice" ? "ice" : "ember"]);
      ctx.restore();
    }
  }
  private discPts(c: V, r: number, z: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * 6.2832;
      pts.push(this.P([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + z]));
    }
    return pts;
  }
  private drawDisc(ctx: CanvasRenderingContext2D, d: Disc) {
    const h = (d.th || 0.04) / 2;
    const f0 = this.discPts(d.c, d.r, -h);
    const f1 = this.discPts(d.c, d.r, h);
    const c0 = this.P([d.c[0], d.c[1], d.c[2] - h]);
    const c1 = this.P([d.c[0], d.c[1], d.c[2] + h]);
    const nearIs1 = c1[2] < c0[2];
    const far = nearIs1 ? f0 : f1;
    const near = nearIs1 ? f1 : f0;
    const cn = nearIs1 ? c1 : c0;
    ctx.save();
    ctx.globalAlpha = d.alpha || 1;
    ctx.fillStyle = "#0C0C0E";
    this.poly(ctx, far);
    ctx.fill();
    ctx.fillStyle = "#1A1A1D";
    ctx.strokeStyle = "#1A1A1D";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 30; i++) {
      const j = (i + 1) % 30;
      ctx.beginPath();
      ctx.moveTo(far[i][0], far[i][1]);
      ctx.lineTo(far[j][0], far[j][1]);
      ctx.lineTo(near[j][0], near[j][1]);
      ctx.lineTo(near[i][0], near[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const rr = Math.max(1, d.r * cn[3]);
    const g = ctx.createRadialGradient(cn[0] - rr * 0.3, cn[1] - rr * 0.35, rr * 0.05, cn[0], cn[1], rr * 1.05);
    g.addColorStop(0, d.face0 || "#34343A");
    g.addColorStop(1, d.face1 || "#141416");
    ctx.fillStyle = g;
    this.poly(ctx, near);
    ctx.fill();
    if (d.rim) {
      ctx.strokeStyle = d.rim;
      ctx.lineWidth = Math.max(1.5, 0.012 * cn[3]);
      this.poly(ctx, near);
      ctx.stroke();
    }
    if (d.hub) {
      ctx.fillStyle = "#6A6A72";
      this.poly(ctx, this.discPts(d.c, d.hub, nearIs1 ? h + 0.001 : -h - 0.001));
      ctx.fill();
    }
    ctx.restore();
  }
  private drawGuide(ctx: CanvasRenderingContext2D, g: Guide) {
    ctx.save();
    ctx.strokeStyle = g.col;
    ctx.lineWidth = g.w || 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (g.dash) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    g.pts.forEach((p, i) => {
      const q = this.P(p);
      if (i) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    });
    ctx.stroke();
    ctx.restore();
  }
  private drawTrackDot(ctx: CanvasRenderingContext2D, p: V) {
    const tp = this.P(p);
    ctx.save();
    ctx.fillStyle = "#8CC8FF";
    ctx.shadowColor = "#8CC8FF";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tp[0], tp[1], 4.5, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }
  private drawRing(ctx: CanvasRenderingContext2D, r: Ring) {
    const n = this.nrm(r.n);
    const u = this.nrm(this.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const v = this.cross(n, u);
    const pts: Pt[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * 6.2832;
      pts.push(this.P(this.add(r.c, this.add(this.mul(u, Math.cos(a) * r.r), this.mul(v, Math.sin(a) * r.r)))));
    }
    ctx.save();
    ctx.globalAlpha = r.a == null ? 1 : r.a;
    ctx.strokeStyle = r.col;
    ctx.lineWidth = 2;
    ctx.shadowColor = r.col;
    ctx.shadowBlur = 10;
    this.poly(ctx, pts);
    ctx.stroke();
    ctx.restore();
  }
  private drawLabel(ctx: CanvasRenderingContext2D, l: Label) {
    const p = this.P(l.p);
    ctx.save();
    ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
    const w = ctx.measureText(l.text).width + 14;
    const h = 20;
    const x = Math.max(4, Math.min(this.W - w - 4, p[0] + (l.dx == null ? 14 : l.dx)));
    const y = Math.max(46, Math.min(this.H - 56, p[1] + (l.dy == null ? -24 : l.dy)));
    ctx.strokeStyle = l.col;
    ctx.fillStyle = l.col;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(x + (x > p[0] ? 0 : w), y + h / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "rgba(10,10,11,.84)";
    this.rrect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = l.col;
    ctx.textBaseline = "middle";
    ctx.fillText(l.text, x + 7, y + h / 2 + 0.5);
    ctx.restore();
  }
  private drawFloor(ctx: CanvasRenderingContext2D) {
    const D = this.D;
    const R = D.floorR || 1.3;
    const c = D.floorC || [0, 0, 0];
    const pts: Pt[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 6.2832;
      pts.push(this.P([c[0] + Math.cos(a) * R, 0, c[2] + Math.sin(a) * R]));
    }
    const C = this.P(c);
    let rx = 1;
    pts.forEach((p) => {
      rx = Math.max(rx, Math.hypot(p[0] - C[0], p[1] - C[1]));
    });
    const g = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], rx);
    g.addColorStop(0, "rgba(46,46,52,.95)");
    g.addColorStop(0.6, "rgba(30,30,34,.7)");
    g.addColorStop(1, "rgba(20,20,22,0)");
    ctx.fillStyle = g;
    this.poly(ctx, pts);
    ctx.fill();
    ctx.save();
    this.poly(ctx, pts);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 1;
    for (let v = -R; v <= R + 1e-6; v += 0.25) {
      let a = this.P([c[0] + v, 0, c[2] - R]);
      let b = this.P([c[0] + v, 0, c[2] + R]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      a = this.P([c[0] - R, 0, c[2] + v]);
      b = this.P([c[0] + R, 0, c[2] + v]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  private split(segs: Seg[]): Seg[] {
    const out: Seg[] = [];
    segs.forEach((s) => {
      const d = this.sub(s.b, s.a);
      const n = Math.max(1, Math.ceil(this.len(d) / 0.22));
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        out.push({ ...s, a: this.add(s.a, this.mul(d, u0)), b: this.add(s.a, this.mul(d, u1)), ra: s.ra + (s.rb - s.ra) * u0, rb: s.ra + (s.rb - s.ra) * u1 });
      }
    });
    return out;
  }
  private silhouette(c2: CanvasRenderingContext2D, pose: Pose, ground: boolean, color: string) {
    const G = ground ? (p: V): V => [p[0] + p[1] * 0.16, 0.002, p[2] + p[1] * 0.1] : undefined;
    const g = G || ((p: V) => p);
    pose.lofts.forEach((L) => this.fillLoft(c2, this.loftGeom(L.secs, G), null, color));
    pose.spheres.forEach((s) => {
      if (!ground && s.k !== "body") return;
      const C = this.P(g(s.c));
      c2.fillStyle = color;
      c2.beginPath();
      c2.arc(C[0], C[1], s.r * C[3], 0, 6.2832);
      c2.fill();
    });
    if (!ground) return;
    pose.segs.forEach((s) => {
      if (s.k === "line") return;
      const A = this.P(g(s.a));
      const B = this.P(g(s.b));
      this.cap(c2, A, B, s.ra * A[3], s.rb * B[3], null, color);
    });
    pose.discs.forEach((d) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * 6.2832;
        pts.push(this.P(g([d.c[0] + Math.cos(a) * d.r, d.c[1] + Math.sin(a) * d.r, d.c[2]])));
      }
      c2.fillStyle = color;
      this.poly(c2, pts);
      c2.fill();
    });
  }
  private composite(ctx: CanvasRenderingContext2D, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sh!, 0, 0, this.W, this.H);
    ctx.restore();
  }

  draw() {
    if (this.three) {
      this.setCam();
      const p3 = this.poseAt(this.t);
      this.cur = p3;
      this.render3D(p3);
      this.drawOverlay(p3);
      return;
    }
    const ctx = this.ctx!;
    const sc = this.sctx!;
    const W = this.W;
    const H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    sc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.setCam();
    this.drawFloor(ctx);
    // Motion smear: the last few frames' silhouettes, very faint, behind the figure.
    if (this.playing && !this.reduce) {
      sc.clearRect(0, 0, W, H);
      for (let k = 1; k <= 3; k++) this.silhouette(sc, this.poseAt((this.t - k * 0.011 * this.speed + 1) % 1), false, "#F5F3EE");
      this.composite(ctx, 0.05);
    }
    const pose = this.poseAt(this.t);
    this.cur = pose;
    sc.clearRect(0, 0, W, H);
    this.silhouette(sc, pose, true, "#000");
    this.composite(ctx, 0.4);
    pose.guides.forEach((g) => {
      if (!g.top) this.drawGuide(ctx, g);
    });
    if (this.ghost) {
      sc.clearRect(0, 0, W, H);
      this.silhouette(sc, this.ghost, false, "#8CC8FF");
      this.composite(ctx, 0.09);
    }
    const items: Array<{ z: number; f: () => void }> = [];
    this.split(pose.segs).forEach((s) => {
      const A = this.P(s.a);
      const B = this.P(s.b);
      items.push({ z: (A[2] + B[2]) / 2, f: () => this.drawSeg(ctx, s, A, B) });
    });
    pose.lofts.forEach((L) => {
      const m = L.secs[Math.floor(L.secs.length / 2)].c;
      items.push({ z: this.P(m)[2], f: () => this.drawLoft(ctx, L, pose.act) });
    });
    pose.spheres.forEach((s) => {
      const C = this.P(s.c);
      items.push({ z: C[2], f: () => this.drawSphere(ctx, s, C, pose.act) });
    });
    pose.discs.forEach((d) => {
      const C = this.P(d.c);
      items.push({ z: C[2], f: () => this.drawDisc(ctx, d) });
    });
    items.sort((a, b) => b.z - a.z);
    items.forEach((it) => it.f());
    this.drawGuide(ctx, { pts: this.trail, col: "rgba(140,200,255,.45)", dash: true, w: 1.6 });
    this.drawTrackDot(ctx, pose.track);
    pose.guides.forEach((g) => {
      if (g.top) this.drawGuide(ctx, g);
    });
    pose.rings.forEach((r) => this.drawRing(ctx, r));
    pose.labels.forEach((l) => this.drawLabel(ctx, l));
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Monotone cubic (Fritsch–Carlson) interpolation through [t, value] keys. */
export function monotoneCubic(k: number[][], t: number): number {
  const n = k.length;
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[n - 1][0]) return k[n - 1][1];
  let i = 1;
  while (i < n - 1 && t > k[i][0]) i++;
  const slope = (j: number) => {
    if (j <= 0 || j >= n - 1) return 0;
    const d0 = (k[j][1] - k[j - 1][1]) / (k[j][0] - k[j - 1][0] || 1e-6);
    const d1 = (k[j + 1][1] - k[j][1]) / (k[j + 1][0] - k[j][0] || 1e-6);
    return d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1);
  };
  const x0 = k[i - 1][0];
  const x1 = k[i][0];
  const y0 = k[i - 1][1];
  const y1 = k[i][1];
  const h = x1 - x0 || 1e-6;
  const u = (t - x0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * slope(i - 1) + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * slope(i);
}
