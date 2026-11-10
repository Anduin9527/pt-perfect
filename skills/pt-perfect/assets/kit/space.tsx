// Space: a small orthographic 3D scene that renders to plain SVG paths.
// Surfaces become shaded quads, curves become short segments, and everything is
// painter-sorted by depth, so the result stays vector, editable and print-sharp.
import type { ReactNode } from 'react';
import { mix, r, type Box, type Pt } from './scene';

export type V3 = [number, number, number];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const dist3 = (a: V3, b: V3) => Math.hypot(...sub(a, b));

export type CurveStyle = { color: string; width?: number; opacity?: number; dash?: string; arrow?: boolean | number; bias?: number };

export class Space {
  private prims: { depth: number; el: ReactNode }[] = [];
  private n = 0;
  private R: V3; private U: V3; private D: V3; private L: V3;
  box: Box; scale: number; centre: V3;

  /** `azimuth`/`elevation` in degrees place the camera; z is up. `scale` is pt per world unit; `centre` maps to the middle of `box`. */
  constructor(o: { box: Box; azimuth: number; elevation: number; scale: number; centre?: V3; light?: V3 }) {
    const az = o.azimuth * Math.PI / 180, el = o.elevation * Math.PI / 180;
    this.D = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    this.R = [-Math.sin(az), Math.cos(az), 0];
    this.U = [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), Math.cos(el)];
    this.L = unit(o.light ?? [0.3, -0.4, 1]);
    this.box = o.box; this.scale = o.scale; this.centre = o.centre ?? [0, 0, 0];
  }

  /** Screen position (pt) of a world point; use it to anchor kit labels and wires. */
  at(p: V3): Pt {
    const q = sub(p, this.centre);
    return [this.box.x + this.box.w / 2 + dot3(q, this.R) * this.scale, this.box.y + this.box.h / 2 - dot3(q, this.U) * this.scale];
  }
  /** Larger is nearer to the camera. */
  depth(p: V3) { return dot3(p, this.D); }
  private add(depth: number, el: ReactNode) { this.prims.push({ depth, el: <g key={this.n++}>{el}</g> }); }
  private P(p: V3) { const [x, y] = this.at(p); return `${r(x)} ${r(y)}`; }

  /** Parametric surface f(u, v) as flat-shaded quads from `dark` to `light`, with optional iso-lines. */
  surface(f: (u: number, v: number) => V3, o: { u: [number, number]; v: [number, number]; n?: [number, number]; dark: string; light: string; opacity?: number; grid?: { u?: number; v?: number; color: string; width?: number }; edge?: { color: string; width?: number } }) {
    const [nu, nv] = o.n ?? [24, 24], U = (i: number) => o.u[0] + (o.u[1] - o.u[0]) * i / nu, V = (j: number) => o.v[0] + (o.v[1] - o.v[0]) * j / nv;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = f(U(i), V(j)), b = f(U(i + 1), V(j)), c = f(U(i + 1), V(j + 1)), d = f(U(i), V(j + 1));
      let nrm = unit(cross(sub(c, a), sub(d, b)));
      if (dot3(nrm, this.D) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]]; // shade the side that faces the camera
      const fill = mix(o.dark, o.light, Math.max(0, Math.min(1, 0.5 + 0.5 * dot3(nrm, this.L))));
      const mid: V3 = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      // The quad is stroked in its own colour so neighbouring quads leave no hairline seams.
      this.add(this.depth(mid), <path d={`M${this.P(a)}L${this.P(b)}L${this.P(c)}L${this.P(d)}Z`} fill={fill} stroke={fill} strokeWidth={0.3} strokeLinejoin="round" fillOpacity={o.opacity} strokeOpacity={o.opacity} />);
    }
    const g = o.grid, iso = (pts: V3[]) => this.curve(pts, { color: g!.color, width: g!.width ?? 0.3, bias: 0.012 });
    if (g?.u) for (let i = 0; i <= nu; i += g.u) iso(Array.from({ length: nv + 1 }, (_, j) => f(U(i), V(j))));
    if (g?.v) for (let j = 0; j <= nv; j += g.v) iso(Array.from({ length: nu + 1 }, (_, i) => f(U(i), V(j))));
    if (o.edge) {
      const e = { color: o.edge.color, width: o.edge.width ?? 0.5, bias: 0.014 };
      this.curve(Array.from({ length: nv + 1 }, (_, j) => f(U(0), V(j))), e); this.curve(Array.from({ length: nv + 1 }, (_, j) => f(U(nu), V(j))), e);
      this.curve(Array.from({ length: nu + 1 }, (_, i) => f(U(i), V(0))), e); this.curve(Array.from({ length: nu + 1 }, (_, i) => f(U(i), V(nv))), e);
    }
  }

  /** Polyline through world points. Each segment is depth-sorted on its own, so the surface hides what runs behind it. */
  curve(pts: V3[], o: CurveStyle) {
    const bias = o.bias ?? 0.03, w = o.width ?? 0.6;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      this.add(this.depth(lerp3(a, b, 0.5)) + bias, <path d={`M${this.P(a)}L${this.P(b)}`} fill="none" stroke={o.color} strokeWidth={w} strokeOpacity={o.opacity} strokeDasharray={o.dash} strokeLinecap={o.dash ? 'butt' : 'round'} />);
    }
    if (o.arrow) {
      const L = typeof o.arrow === 'number' ? o.arrow : 3.6, W = L * 0.4, e = this.at(pts[pts.length - 1]);
      let k = pts.length - 2; // step back until the direction is well defined on screen
      while (k > 0 && Math.hypot(e[0] - this.at(pts[k])[0], e[1] - this.at(pts[k])[1]) < L) k--;
      const p = this.at(pts[k]), len = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1, ux = (e[0] - p[0]) / len, uy = (e[1] - p[1]) / len;
      this.add(this.depth(pts[pts.length - 1]) + bias + 0.01, <path d={`M${r(e[0])} ${r(e[1])}L${r(e[0] - ux * L - uy * W)} ${r(e[1] - uy * L + ux * W)}L${r(e[0] - ux * L * 0.72)} ${r(e[1] - uy * L * 0.72)}L${r(e[0] - ux * L + uy * W)} ${r(e[1] - uy * L - ux * W)}Z`} fill={o.color} fillOpacity={o.opacity} />);
    }
  }

  dot(p: V3, o: { r?: number; fill: string; stroke?: string; width?: number; opacity?: number; bias?: number }) {
    const [x, y] = this.at(p);
    this.add(this.depth(p) + (o.bias ?? 0.05), <circle cx={r(x)} cy={r(y)} r={o.r ?? 1.6} fill={o.fill} stroke={o.stroke} strokeWidth={o.stroke ? o.width ?? 0.5 : undefined} fillOpacity={o.opacity} />);
  }

  /** Filled polygon in world space (a patch, a plane, a shadow). */
  polygon(pts: V3[], o: { fill: string; opacity?: number; stroke?: string; width?: number; dash?: string; bias?: number }) {
    const c = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as V3, [0, 0, 0] as V3).map(v => v / pts.length) as V3;
    this.add(this.depth(c) + (o.bias ?? 0), <path d={`M${pts.map(p => this.P(p)).join('L')}Z`} fill={o.fill} fillOpacity={o.opacity} stroke={o.stroke} strokeWidth={o.stroke ? o.width ?? 0.4 : undefined} strokeDasharray={o.dash} strokeLinejoin="round" />);
  }

  /** Back-to-front SVG; hand it to `scene.raw(id, space.render(), space.box, { kind: 'region' })`. */
  render(): ReactNode { return <g>{this.prims.slice().sort((a, b) => a.depth - b.depth).map(p => p.el)}</g>; }
}

/** Seeded uniform generator, so stochastic drawings rebuild identically. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Standard normal draws from a uniform generator (Box-Muller). */
export function gaussian(rand: () => number) {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
