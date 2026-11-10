// Scene: drawing primitives that (1) size themselves from measured content,
// (2) emit plain portable SVG, and (3) record their geometry for the audit.
import type { ReactNode } from 'react';
import { line as measureLine, type Line } from './measure';
import type { Theme, Tone } from './theme';

export type Box = { x: number; y: number; w: number; h: number };
export type Pt = [number, number];
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type Kind = 'label' | 'image' | 'node' | 'op' | 'raw' | 'region';
export type Item = { id: string; kind: Kind; box: Box; inside?: string; size?: number; group?: string; source?: string; round?: boolean };
export type WireRec = { id: string; pts: Pt[]; from?: string; to?: string; cross: string[]; arrow: boolean; headLength: number };
type Layer = 'back' | 'wire' | 'body' | 'label';
type Text = string | Line;

export const cx = (b: Box) => b.x + b.w / 2;
export const cy = (b: Box) => b.y + b.h / 2;
export const right = (b: Box) => b.x + b.w;
export const bottom = (b: Box) => b.y + b.h;
/** Point on a box edge. `at` runs 0..1 along the edge; `out` moves away from the box. */
export function port(b: Box, side: Side, at = 0.5, out = 0): Pt {
  if (side === 'left') return [b.x - out, b.y + b.h * at];
  if (side === 'right') return [b.x + b.w + out, b.y + b.h * at];
  if (side === 'top') return [b.x + b.w * at, b.y - out];
  return [b.x + b.w * at, b.y + b.h + out];
}
/** Smallest box holding all the given boxes. */
export function union(...bs: Box[]): Box {
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(right)) - x, h: Math.max(...bs.map(bottom)) - y };
}
/** Box enlarged by `d` on every side, or by [top, right, bottom, left]. */
export function grow(b: Box, d: number | [number, number, number, number]): Box {
  const [t, rr, bb, l] = typeof d === 'number' ? [d, d, d, d] : d;
  return { x: b.x - l, y: b.y - t, w: b.w + l + rr, h: b.h + t + bb };
}
export const mid = (a: Pt, b: Pt, t = 0.5): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function hit(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-3 && t < 1 - 1e-3 && u > 1e-3 && u < 1 - 1e-3 ? [a[0] + t * rx, a[1] + t * ry] : null;
}

/** Left edges for items of the given widths, spread over [x0, x1] with equal gaps. */
export function spread(widths: number[], x0: number, x1: number): number[] {
  const gap = (x1 - x0 - widths.reduce((s, w) => s + w, 0)) / Math.max(1, widths.length - 1);
  const xs: number[] = [];
  let x = x0;
  for (const w of widths) { xs.push(x); x += w + gap; }
  return xs;
}

const ICONS: Record<string, string[]> = {
  // Tabler Icons (MIT), outline set.
  snowflake: ['M10 4l2 1l2 -1', 'M12 2v6.5l3 1.72', 'M17.928 6.268l.134 2.232l1.866 1.232', 'M20.66 7l-5.629 3.25l.01 3.458', 'M19.928 14.268l-1.866 1.232l-.134 2.232', 'M20.66 17l-5.629 -3.25l-2.99 1.738', 'M14 20l-2 -1l-2 1', 'M12 22v-6.5l-3 -1.72', 'M6.072 17.732l-.134 -2.232l-1.866 -1.232', 'M3.34 17l5.629 -3.25l-.01 -3.458', 'M4.072 9.732l1.866 -1.232l.134 -2.232', 'M3.34 7l5.629 3.25l2.99 -1.738'],
  flame: ['M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.621 -2.333 5.588c0 3.704 3.134 6.706 7 6.706s7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235'],
};

export type NodeSpec = {
  lines?: Text[]; tone?: string; size?: number; bold?: boolean; color?: string;
  x?: number; y?: number; cx?: number; cy?: number; w?: number; h?: number; minW?: number; minH?: number;
  padX?: number; padY?: number; dash?: boolean; fill?: string; group?: string; radius?: number;
  /** Thin upright layer: the text is rotated to read bottom-to-top. */
  vertical?: boolean;
};
/** Built-in operator glyphs, a custom stroke path in unit-circle coordinates, or a short text/TeX glyph. */
export type OpKind = 'add' | 'sub' | 'mul' | 'concat' | { path: string; tone?: string } | { text: string };
export type WireOpts = { tone?: string; dash?: boolean; arrow?: boolean; from?: string; to?: string; cross?: string[]; hop?: string[]; width?: number; color?: string };
export type LegendEntry = { text: Text; op?: OpKind; swatch?: string; fill?: string; icon?: string; wire?: { tone?: string; dash?: boolean }; tone?: string };

export class Scene {
  width: number;
  height = 0;
  theme: Theme;
  assets: Record<string, string>;
  items: Item[] = [];
  wires: WireRec[] = [];
  private layers: Record<Layer, ReactNode[]> = { back: [], wire: [], body: [], label: [] };
  private n = 0;

  constructor(width: number, theme: Theme, assets: Record<string, string>) {
    this.width = width; this.theme = theme; this.assets = assets;
  }

  tone(name = 'neutral'): Tone {
    const t = this.theme.tones[name];
    if (!t) throw new Error(`Unknown tone "${name}"`);
    return t;
  }
  /** Fill and text colour of a node in the theme's look; an explicit fill is kept as given. */
  private paint(name: string | undefined, fill?: string): { fill: string; text: string } {
    const T = this.theme, tone = this.tone(name), look = T.look.node;
    if (fill) return { fill, text: T.ink };
    if (look === 'outline') return { fill: T.paper, text: T.ink };
    if (!name || name === 'neutral' || look === 'tint') return { fill: tone.fill, text: T.ink };
    if (look === 'solid') return { fill: tone.stroke, text: T.paper };
    const id = `g${tone.fill.slice(1)}`;
    this.defs.set(id, <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix(tone.fill, T.paper, 0.75)} /><stop offset="1" stopColor={mix(tone.fill, tone.stroke, 0.22)} /></linearGradient>);
    return { fill: `url(#${id})`, text: T.ink };
  }
  private defs = new Map<string, ReactNode>();
  private push(layer: Layer, el: ReactNode) { this.layers[layer].push(<g key={this.n++}>{el}</g>); }
  private register(item: Item) {
    if (this.items.some(i => i.id === item.id)) throw new Error(`Duplicate id "${item.id}"`);
    this.items.push(item);
  }
  box(id: string): Box {
    const item = this.items.find(i => i.id === id);
    if (!item) throw new Error(`No item "${id}"`);
    return item.box;
  }

  /** Measure a line with theme defaults. */
  line(t: Text, o: { size?: number; bold?: boolean; color?: string } = {}): Line {
    return typeof t === 'string' ? measureLine(t, { size: o.size ?? this.theme.size.label, bold: o.bold, color: o.color }) : t;
  }

  private drawLine(l: Line, x: number, baseline: number, color: string) {
    let cursor = x;
    return l.parts.map((p, i) => {
      const px = cursor; cursor += p.w;
      if (p.kind === 'math') {
        const body = p.body.replaceAll('currentColor', l.color ?? color);
        return <g key={i} data-tex={p.tex} transform={`translate(${r(px)} ${r(baseline)}) scale(${r(l.size / 1000, 5)})`} dangerouslySetInnerHTML={{ __html: body }} />;
      }
      const lead = p.text.length - p.text.trimStart().length;
      const offset = lead ? measureLine(p.text.slice(0, lead), { size: l.size, bold: p.style === 'bold' }).w : 0;
      return <text key={i} x={r(px + offset)} y={r(baseline)} fontSize={l.size} fontWeight={p.style === 'bold' ? 700 : undefined} fontStyle={p.style === 'italic' ? 'italic' : undefined} fill={l.color ?? color}>{p.text.trim()}</text>;
    });
  }

  /**
   * Place one line. `ax` anchors horizontally; `ay` anchors vertically:
   * base = baseline at y, mid = cap-height middle at y (optical centre),
   * top = cap top at y, inkTop / inkBottom = real ink edge at y.
   */
  label(id: string, t: Text, o: { x: number; y: number; ax?: 'l' | 'c' | 'r'; ay?: 'base' | 'mid' | 'top' | 'inkTop' | 'inkBottom'; size?: number; bold?: boolean; color?: string; inside?: string; rotate?: boolean; pivot?: Pt }): Box {
    const l = this.line(t, o);
    const ax = o.rotate ? 'c' : o.ax, ay = o.rotate ? 'mid' : o.ay ?? 'base';
    const x = o.x - (ax === 'l' ? 0 : ax === 'r' ? l.w : l.w / 2);
    const baseline = ay === 'base' ? o.y : ay === 'mid' ? o.y + l.cap / 2 : ay === 'top' ? o.y + l.cap : ay === 'inkTop' ? o.y + l.asc : o.y - l.desc;
    let box = { x, y: baseline - l.asc, w: l.w, h: l.asc + l.desc };
    // `rotate` turns the line a quarter-turn (reading bottom-to-top) about its optical centre; `pivot` about a given point.
    const pv = o.pivot ?? (o.rotate ? [o.x, o.y] as Pt : undefined);
    if (pv) box = { x: pv[0] + (box.y - pv[1]), y: pv[1] - (box.x + box.w - pv[0]), w: box.h, h: box.w };
    this.register({ id, kind: 'label', box, inside: o.inside, size: l.size, source: l.source });
    this.push('label', <g data-id={id} data-w={r(l.w)} transform={pv ? `rotate(-90 ${r(pv[0])} ${r(pv[1])})` : undefined}>{this.drawLine(l, x, baseline, o.color ?? this.theme.ink)}</g>);
    return box;
  }

  /** Stack of centred lines under (or over) an anchor; returns the combined ink box. */
  caption(id: string, lines: Text[], o: { x: number; y: number; size?: number; color?: string; gap?: number; ax?: 'l' | 'c' | 'r' }): Box {
    let y = o.y; const boxes: Box[] = [];
    lines.forEach((t, i) => {
      const l = this.line(t, { size: o.size, color: o.color });
      boxes.push(this.label(`${id}.${i}`, l, { x: o.x, y, ax: o.ax ?? 'c', ay: 'top' }));
      y += l.cap + Math.max(o.gap ?? 2.6, l.desc + 1.7);
    });
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    return { x: x0, y: y0, w: Math.max(...boxes.map(right)) - x0, h: Math.max(...boxes.map(bottom)) - y0 };
  }

  private layout(spec: NodeSpec) {
    const T = this.theme;
    const lines = (spec.lines ?? []).map(t => this.line(t, { size: spec.size, bold: spec.bold }));
    const base: number[] = []; // baseline offsets from the first baseline
    lines.forEach((l, i) => base.push(i === 0 ? 0 : base[i - 1] + Math.max(l.size * 1.2, lines[i - 1].desc + l.asc + 1)));
    const last = lines.length - 1;
    // Optical block = cap top of first line .. baseline of last line, centred on the box.
    const optical = lines.length ? lines[0].cap + base[last] : 0;
    const above = lines.length ? Math.max(...lines.map((l, i) => l.asc - base[i])) - lines[0].cap + optical / 2 : 0; // ink above centre
    const below = lines.length ? Math.max(...lines.map((l, i) => base[i] + l.desc)) - base[last] + optical / 2 : 0;
    const padX = spec.padX ?? T.pad.x, padY = spec.padY ?? T.pad.y;
    const cw = Math.max(0, ...lines.map(l => l.w)) + 2 * padX, ch = 2 * (Math.max(above, below) + padY);
    const [iw, ih] = spec.vertical ? [ch, cw] : [cw, ch];
    const w = Math.max(spec.w ?? 0, spec.minW ?? 0, spec.w ? 0 : iw);
    const h = Math.max(spec.h ?? 0, spec.minH ?? 0, spec.h ? 0 : ih);
    return { lines, base, optical, w, h };
  }
  /** Size a node from its content without drawing it. */
  measureNode(spec: NodeSpec): { w: number; h: number } {
    const { w, h } = this.layout(spec);
    return { w, h };
  }

  /** Rounded module whose size grows with its content (sub/superscripts included). */
  node(id: string, spec: NodeSpec): Box {
    const T = this.theme, tone = this.tone(spec.tone);
    const { lines, base, optical, w, h } = this.layout(spec);
    const x = spec.x ?? (spec.cx ?? 0) - w / 2, y = spec.y ?? (spec.cy ?? 0) - h / 2;
    const box = { x, y, w, h };
    this.register({ id, kind: 'node', box, group: spec.group });
    const rx = spec.radius ?? T.radius, sh = T.look.shadow, paint = this.paint(spec.tone, spec.fill);
    if (sh > 0) this.push('back', <rect x={r(x + sh)} y={r(y + sh)} width={r(w)} height={r(h)} rx={rx} fill={tone.stroke} />);
    this.push('body', <rect data-id={id} x={r(x)} y={r(y)} width={r(w)} height={r(h)} rx={rx} fill={paint.fill} stroke={tone.stroke} strokeWidth={T.stroke.node} strokeDasharray={spec.dash ? '2.4 1.8' : undefined} />);
    if (lines.length) {
      const first = y + h / 2 - optical / 2 + lines[0].cap;
      lines.forEach((l, i) => this.label(`${id}.${i}`, l, { x: x + w / 2, y: first + base[i], color: spec.color ?? paint.text, inside: id, pivot: spec.vertical ? [x + w / 2, y + h / 2] : undefined }));
    }
    return box;
  }

  /** Raster tile embedded as its own <image>. */
  tile(id: string, asset: string, o: { x: number; y: number; size: number; h?: number; tone?: string; frame?: number }): Box {
    const href = this.assets[asset];
    if (!href) throw new Error(`Asset "${asset}" is not declared in the figure`);
    const box = { x: o.x, y: o.y, w: o.size, h: o.h ?? o.size };
    this.register({ id, kind: 'image', box });
    const stroke = o.tone ? this.tone(o.tone).stroke : this.theme.hairline;
    this.push('body', <g data-id={id} data-asset={asset}>
      <image href={href} x={r(o.x)} y={r(o.y)} width={r(box.w)} height={r(box.h)} preserveAspectRatio="none" />
      {o.frame !== 0 && <rect x={r(o.x)} y={r(o.y)} width={r(box.w)} height={r(box.h)} fill="none" stroke={stroke} strokeWidth={o.frame ?? (o.tone ? this.theme.stroke.node : this.theme.stroke.hair)} />}
    </g>);
    return box;
  }

  /** Circle operator: add, subtract, multiply, concat, a custom path, or a short text/TeX glyph. */
  op(id: string, kind: OpKind, o: { cx: number; cy: number; r?: number; tone?: string }): Box {
    const R = o.r ?? 4.6, tone = this.tone(o.tone), k = R * 0.5, sw = this.theme.stroke.node, { cx: X, cy: Y } = o;
    const box = { x: X - R, y: Y - R, w: 2 * R, h: 2 * R };
    this.register({ id, kind: 'op', box, round: true });
    let glyph: ReactNode;
    if (typeof kind === 'object' && 'text' in kind) {
      const l = this.line(kind.text, { size: R * 1.35 });
      glyph = this.drawLine(l, X - l.w / 2, Y + (l.asc - l.desc) / 2, tone.text);
    } else if (typeof kind === 'object') {
      glyph = <path d={kind.path} transform={`translate(${r(X)} ${r(Y)}) scale(${r(R, 3)})`} fill="none" stroke={kind.tone ? this.tone(kind.tone).line : tone.stroke} strokeWidth={r(sw / R, 4)} strokeLinecap="round" strokeLinejoin="round" />;
    } else {
      const d = kind === 'add' ? `M${r(X - k)} ${r(Y)}H${r(X + k)}M${r(X)} ${r(Y - k)}V${r(Y + k)}`
        : kind === 'sub' ? `M${r(X - k)} ${r(Y)}H${r(X + k)}`
        : kind === 'mul' ? `M${r(X - k * 0.75)} ${r(Y - k * 0.75)}L${r(X + k * 0.75)} ${r(Y + k * 0.75)}M${r(X + k * 0.75)} ${r(Y - k * 0.75)}L${r(X - k * 0.75)} ${r(Y + k * 0.75)}`
        : `M${r(X + k * 0.72)} ${r(Y - k * 0.62)}A${r(k * 0.95)} ${r(k * 0.95)} 0 1 0 ${r(X + k * 0.72)} ${r(Y + k * 0.62)}`;
      glyph = <path d={d} fill="none" stroke={tone.stroke} strokeWidth={sw} strokeLinecap="round" />;
    }
    this.push('body', <g data-id={id}><circle cx={r(X)} cy={r(Y)} r={R} fill={this.theme.paper} stroke={tone.stroke} strokeWidth={sw} />{glyph}</g>);
    return box;
  }

  icon(id: string, name: keyof typeof ICONS | string, o: { cx: number; cy: number; size?: number; tone?: string; color?: string }): Box {
    const size = o.size ?? 8, paths = ICONS[name];
    if (!paths) throw new Error(`Unknown icon "${name}"`);
    const box = { x: o.cx - size / 2, y: o.cy - size / 2, w: size, h: size };
    this.register({ id, kind: 'raw', box });
    this.push('label', <g data-id={id} transform={`translate(${r(box.x)} ${r(box.y)}) scale(${r(size / 24, 5)})`} fill="none" stroke={o.color ?? this.tone(o.tone).stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{paths.map((d, i) => <path key={i} d={d} />)}</g>);
    return box;
  }

  /** Icon in a small white disc, meant to sit on a module corner. */
  badge(id: string, name: string, o: { cx: number; cy: number; tone?: string; r?: number; inside?: string }): Box {
    const R = o.r ?? 5, tone = this.tone(o.tone), size = R * 1.45, paths = ICONS[name];
    if (!paths) throw new Error(`Unknown icon "${name}"`);
    const box = { x: o.cx - R, y: o.cy - R, w: 2 * R, h: 2 * R };
    this.register({ id, kind: 'raw', box, inside: o.inside, round: true });
    this.push('label', <g data-id={id}><circle cx={r(o.cx)} cy={r(o.cy)} r={R} fill={this.theme.paper} stroke={tone.stroke} strokeWidth={this.theme.stroke.hair} />
      <g transform={`translate(${r(o.cx - size / 2)} ${r(o.cy - size / 2)}) scale(${r(size / 24, 5)})`} fill="none" stroke={tone.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{paths.map((d, i) => <path key={i} d={d} />)}</g></g>);
    return box;
  }

  /** Small filled dot for a T-junction; not an audit object. */
  dot(p: Pt, o: { tone?: string; r?: number } = {}) {
    this.push('wire', <circle cx={r(p[0])} cy={r(p[1])} r={o.r ?? 1.1} fill={this.tone(o.tone).line} />);
  }

  /** Grouping frame behind everything; wires may cross it. */
  region(id: string, box: Box, o: { tone?: string; dash?: boolean; fill?: string | false; radius?: number } = {}): Box {
    const tone = this.tone(o.tone ?? 'grey');
    this.register({ id, kind: 'region', box });
    this.push('back', <rect data-id={id} x={r(box.x)} y={r(box.y)} width={r(box.w)} height={r(box.h)} rx={o.radius ?? this.theme.radius + 1} fill={o.fill === false ? 'none' : o.fill ?? tone.fill} stroke={tone.stroke} strokeWidth={this.theme.stroke.hair} strokeDasharray={o.dash === false ? undefined : '2.4 1.8'} />);
    return box;
  }

  /**
   * Titled container for a block that is opened up. It sits behind its content
   * like a region; the title goes in a corner inside, or centred below.
   */
  panel(id: string, box: Box, o: { title?: Text; tone?: string; dash?: boolean; fill?: string | false; at?: 'tl' | 'tr' | 'tc' | 'below'; size?: number; color?: string; pad?: number } = {}): Box {
    const tone = this.tone(o.tone ?? 'grey'), T = this.theme, pad = o.pad ?? 4.5, at = o.at ?? 'tl';
    const look = T.look.panel, tab = look === 'tab' && at === 'tl' && !!o.title;
    this.region(id, box, { tone: o.tone ?? 'grey', dash: o.dash ?? false, fill: o.fill ?? (look === 'tint' ? mix(tone.fill, T.paper, 0.5) : false) });
    if (o.title) {
      const l = this.line(o.title, { size: o.size ?? T.size.label, bold: true });
      if (tab) {
        // Filled tab in the corner, sized to the title so it takes no room from the panel's content.
        const w = l.w + 2 * pad, h = l.cap + 1.6 * pad, R = T.radius + 1, c = Math.min(R, h / 2);
        this.push('back', <path d={`M${r(box.x)} ${r(box.y + h)}V${r(box.y + R)}a${R} ${R} 0 0 1 ${R} ${-R}H${r(box.x + w)}V${r(box.y + h - c)}a${c} ${c} 0 0 1 ${-c} ${c}Z`} fill={tone.stroke} />);
      }
      if (at === 'below') this.label(`${id}.title`, l, { x: cx(box), y: bottom(box) + 4, ax: 'c', ay: 'top', color: o.color ?? T.ink });
      else this.label(`${id}.title`, l, { x: at === 'tl' ? box.x + pad : at === 'tr' ? right(box) - pad : cx(box), y: box.y + pad * (tab ? 0.8 : 1), ax: at === 'tl' ? 'l' : at === 'tr' ? 'r' : 'c', ay: 'top', color: o.color ?? (tab ? T.paper : tone.text) });
    }
    return box;
  }

  /**
   * Zoom callout: a faint funnel from a small block to the panel that opens it
   * up. Drawn behind everything and not audited; keep labels and wires off it.
   */
  zoom(id: string, from: Box, to: Box, o: { tone?: string; opacity?: number } = {}) {
    const tone = this.tone(o.tone ?? 'grey');
    const gaps: [number, Pt[]][] = [
      [to.x - right(from), [[right(from), from.y], [to.x, to.y], [to.x, bottom(to)], [right(from), bottom(from)]]],
      [from.x - right(to), [[from.x, from.y], [right(to), to.y], [right(to), bottom(to)], [from.x, bottom(from)]]],
      [to.y - bottom(from), [[from.x, bottom(from)], [to.x, to.y], [right(to), to.y], [right(from), bottom(from)]]],
      [from.y - bottom(to), [[from.x, from.y], [to.x, bottom(to)], [right(to), bottom(to)], [right(from), from.y]]],
    ];
    const [gap, q] = gaps.sort((a, b) => b[0] - a[0])[0];
    if (gap <= 0) throw new Error(`Zoom "${id}": the two boxes overlap`);
    const P = (p: Pt) => `${r(p[0])} ${r(p[1])}`;
    this.push('back', <g data-zoom={id}>
      <path d={`M${P(q[0])}L${P(q[1])}L${P(q[2])}L${P(q[3])}Z`} fill={tone.stroke} fillOpacity={o.opacity ?? 0.1} />
      <path d={`M${P(q[0])}L${P(q[1])}M${P(q[3])}L${P(q[2])}`} fill="none" stroke={tone.stroke} strokeWidth={this.theme.stroke.hair} strokeDasharray="1.6 1.6" />
    </g>);
  }

  /** Key for operators, colours, icons and line styles. `y` is the centre line of the first entry. */
  legend(id: string, entries: LegendEntry[], o: { x: number; y: number; ax?: 'l' | 'r' | 'c'; dir?: 'row' | 'column'; gap?: number; size?: number; rowGap?: number }): Box {
    const T = this.theme, size = o.size ?? T.size.note, column = o.dir === 'column', R = 3.6;
    const symW = (e: LegendEntry) => e.op ? 2 * R : e.swatch ? 9 : e.wire ? 14 : e.icon ? 7 : 0;
    const lines = entries.map(e => this.line(e.text, { size }));
    const colW = Math.max(...entries.map(symW));
    const widths = entries.map((e, i) => (column ? colW : symW(e)) + 3 + lines[i].w);
    const gap = o.gap ?? 10, total = column ? Math.max(...widths) : widths.reduce((a, b) => a + b, 0) + gap * (entries.length - 1);
    let x = o.x - (o.ax === 'r' ? total : o.ax === 'c' ? total / 2 : 0), y = o.y;
    const boxes: Box[] = [];
    entries.forEach((e, i) => {
      const sw = column ? colW : symW(e), sx = x + sw / 2, eid = `${id}.${i}`;
      if (e.op) boxes.push(this.op(eid, e.op, { cx: sx, cy: y, r: R, tone: e.tone }));
      else if (e.icon) boxes.push(this.icon(eid, e.icon, { cx: sx, cy: y, size: 7, tone: e.tone }));
      else if (e.swatch) { const t = this.tone(e.swatch); boxes.push(this.raw(eid, <rect x={r(sx - 4.5)} y={r(y - 3)} width={9} height={6} rx={1.2} fill={this.paint(e.swatch, e.fill).fill} stroke={t.stroke} strokeWidth={T.stroke.node} />, { x: sx - 4.5, y: y - 3, w: 9, h: 6 }, { layer: 'label' })); }
      else if (e.wire) { const c = this.tone(e.wire.tone).line, L = T.arrow.length, W = T.arrow.width / 2, xe = sx + 7; boxes.push(this.raw(eid, <g><path d={`M${r(sx - 7)} ${r(y)}H${r(xe - L * 0.8)}`} stroke={c} strokeWidth={T.stroke.wire} strokeDasharray={e.wire.dash ? '2.4 1.8' : undefined} fill="none" /><path d={`M${r(xe)} ${r(y)}L${r(xe - L)} ${r(y - W)}L${r(xe - L * 0.72)} ${r(y)}L${r(xe - L)} ${r(y + W)}Z`} fill={c} /></g>, { x: sx - 7, y: y - W, w: 14, h: 2 * W }, { layer: 'label' })); }
      boxes.push(this.label(`${eid}.text`, lines[i], { x: x + sw + 3, y, ax: 'l', ay: 'mid', color: T.muted }));
      if (column) y += o.rowGap ?? 11; else x += widths[i] + gap;
    });
    return union(...boxes);
  }

  /**
   * Straight arrow between two items that face each other: vertical when their
   * x-ranges overlap, horizontal when their y-ranges overlap.
   */
  link(a: string, b: string, o: WireOpts & { id?: string } = {}) {
    const A = this.items.find(i => i.id === a), B = this.items.find(i => i.id === b);
    if (!A || !B) throw new Error(`link: unknown item "${!A ? a : b}"`);
    const pick = (lo: number, hi: number, ca: number, cb: number) => A.round ? ca : B.round ? cb : Math.abs(ca - cb) < 0.05 ? ca : (lo + hi) / 2;
    const xlo = Math.max(A.box.x, B.box.x), xhi = Math.min(right(A.box), right(B.box));
    const ylo = Math.max(A.box.y, B.box.y), yhi = Math.min(bottom(A.box), bottom(B.box));
    let pts: Pt[];
    if (xhi - xlo > 0 && yhi - ylo <= 0) {
      const x = pick(xlo, xhi, cx(A.box), cx(B.box));
      pts = A.box.y < B.box.y ? [[x, bottom(A.box)], [x, B.box.y]] : [[x, A.box.y], [x, bottom(B.box)]];
    } else if (yhi - ylo > 0 && xhi - xlo <= 0) {
      const y = pick(ylo, yhi, cy(A.box), cy(B.box));
      pts = A.box.x < B.box.x ? [[right(A.box), y], [B.box.x, y]] : [[A.box.x, y], [right(B.box), y]];
    } else throw new Error(`link ${a} -> ${b}: the items do not face each other; use wire() with explicit points`);
    this.wire(o.id ?? `${a}>${b}`, pts, { ...o, from: a, to: b });
  }

  rule(from: Pt, to: Pt, o: { color?: string; width?: number; dash?: string } = {}) {
    this.push('back', <path d={`M${r(from[0])} ${r(from[1])}L${r(to[0])} ${r(to[1])}`} stroke={o.color ?? this.theme.hairline} strokeWidth={o.width ?? this.theme.stroke.hair} strokeDasharray={o.dash} fill="none" />);
  }

  /** Custom drawing with a declared bounding box so the audit still sees it. */
  raw(id: string, el: ReactNode, box: Box, o: { layer?: Layer; kind?: Kind; inside?: string } = {}): Box {
    this.register({ id, kind: o.kind ?? 'raw', box, inside: o.inside });
    this.push(o.layer ?? 'body', <g data-id={id}>{el}</g>);
    return box;
  }

  /**
   * Connector through the given points with rounded elbows. Name the items it
   * starts and ends on (`from`/`to`) so the audit can check that the endpoints
   * sit on their borders and that nothing else is crossed.
   */
  wire(id: string, pts: Pt[], o: WireOpts = {}) {
    const T = this.theme, color = o.color ?? this.tone(o.tone).line, arrow = o.arrow ?? true;
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    if (clean.length < 2) throw new Error(`Wire "${id}" needs two distinct points`);
    this.wires.push({ id, pts: clean, from: o.from, to: o.to, cross: [...(o.cross ?? []), ...(o.hop ?? [])], arrow, headLength: arrow ? T.arrow.length : 0 });
    const end = clean[clean.length - 1], prev = clean[clean.length - 2];
    const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]);
    const ux = (end[0] - prev[0]) / len, uy = (end[1] - prev[1]) / len;
    const drawn = clean.slice();
    if (arrow) drawn[drawn.length - 1] = [end[0] - ux * T.arrow.length * 0.8, end[1] - uy * T.arrow.length * 0.8];
    // `hop`: wires drawn earlier that this one jumps over with a small arc.
    const others = (o.hop ?? []).map(h => { const w = this.wires.find(v => v.id === h); if (!w) throw new Error(`Wire "${id}": hop target "${h}" is not drawn yet`); return w; });
    const hops = (a: Pt, b: Pt) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], H = 1.7;
      const xs = others.flatMap(w => w.pts.slice(1).map((q, j) => hit(a, b, w.pts[j], q)).filter((p): p is Pt => !!p));
      xs.sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
      const sweep = Math.abs(u[0]) > Math.abs(u[1]) ? (u[0] > 0 ? 1 : 0) : (u[1] > 0 ? 1 : 0);
      return xs.map(p => `L${r(p[0] - u[0] * H)} ${r(p[1] - u[1] * H)}A${H} ${H} 0 0 ${sweep} ${r(p[0] + u[0] * H)} ${r(p[1] + u[1] * H)}`).join('');
    };
    let d = `M${r(drawn[0][0])} ${r(drawn[0][1])}`;
    for (let i = 1; i < drawn.length; i++) {
      const [x, y] = drawn[i];
      d += hops(drawn[i - 1], drawn[i]);
      if (i === drawn.length - 1) { d += `L${r(x)} ${r(y)}`; break; }
      const a = drawn[i - 1], b = drawn[i + 1];
      const la = Math.hypot(x - a[0], y - a[1]), lb = Math.hypot(b[0] - x, b[1] - y);
      const rad = Math.min(T.wireRadius, la / 2, lb / 2);
      const p1: Pt = [x - (x - a[0]) / la * rad, y - (y - a[1]) / la * rad], p2: Pt = [x + (b[0] - x) / lb * rad, y + (b[1] - y) / lb * rad];
      d += `L${r(p1[0])} ${r(p1[1])}Q${r(x)} ${r(y)} ${r(p2[0])} ${r(p2[1])}`;
    }
    const L = T.arrow.length, W = T.arrow.width / 2;
    const head = arrow ? `M${r(end[0])} ${r(end[1])}L${r(end[0] - ux * L - uy * W)} ${r(end[1] - uy * L + ux * W)}L${r(end[0] - ux * L * 0.72)} ${r(end[1] - uy * L * 0.72)}L${r(end[0] - ux * L + uy * W)} ${r(end[1] - uy * L - ux * W)}Z` : null;
    this.push('wire', <g data-wire={id}>
      <path d={d} fill="none" stroke={color} strokeWidth={o.width ?? T.stroke.wire} strokeLinejoin="round" strokeDasharray={o.dash ? '2.4 1.8' : undefined} />
      {head && <path d={head} fill={color} />}
    </g>);
  }

  render(meta: { title: string; desc: string }) {
    const W = r(this.width), H = r(this.height);
    return <svg xmlns="http://www.w3.org/2000/svg" width={`${W}pt`} height={`${H}pt`} viewBox={`0 0 ${W} ${H}`} fontFamily={this.theme.fontFamily} role="img">
      <title>{meta.title}</title><desc>{meta.desc}</desc>
      {this.defs.size > 0 && <defs>{[...this.defs.values()]}</defs>}
      <rect width={W} height={H} fill={this.theme.paper} />
      <g id="back">{this.layers.back}</g><g id="wires">{this.layers.wire}</g><g id="body">{this.layers.body}</g><g id="labels">{this.layers.label}</g>
    </svg>;
  }
}

/** Blend two #rrggbb colours; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number) {
  const h = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return '#' + [0, 1, 2].map(i => Math.round(h(a, i) + (h(b, i) - h(a, i)) * t).toString(16).padStart(2, '0')).join('');
}
export function r(v: number, digits = 2) { return +v.toFixed(digits); }
