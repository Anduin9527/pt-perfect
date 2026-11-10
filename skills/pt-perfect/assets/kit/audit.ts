// Geometry audit on the recorded scene. It runs in Node on the same numbers the
// SVG is written from, so it needs no browser. It proves the absence of a list
// of mechanical defects; it does not judge meaning or beauty.
import type { Box, Item, Pt, Scene, WireRec } from './scene';

export type Finding = { level: 'error' | 'warn'; rule: string; ids: string[]; detail: string };

const R = (b: Box) => b.x + b.w, B = (b: Box) => b.y + b.h;
const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const overlap = (a: Box, b: Box) => Math.min(Math.min(R(a), R(b)) - Math.max(a.x, b.x), Math.min(B(a), B(b)) - Math.max(a.y, b.y));
const contains = (outer: Box, inner: Box, pad = 0) => inner.x >= outer.x + pad && inner.y >= outer.y + pad && R(inner) <= R(outer) - pad && B(inner) <= B(outer) - pad;
const f = (v: number) => v.toFixed(2);

/** Length of the part of segment p-q lying strictly inside the box (Liang-Barsky). */
function insideLength(p: Pt, q: Pt, b: Box): number {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  for (const [pp, qq] of [[-dx, p[0] - b.x], [dx, R(b) - p[0]], [-dy, p[1] - b.y], [dy, B(b) - p[1]]] as const) {
    if (Math.abs(pp) < 1e-9) { if (qq <= 0) return 0; continue; }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}

function onBorder(p: Pt, item: Item, tol: number) {
  const b = item.box;
  if (item.round) return Math.abs(Math.hypot(p[0] - (b.x + b.w / 2), p[1] - (b.y + b.h / 2)) - b.w / 2) <= tol;
  const inX = p[0] >= b.x - tol && p[0] <= R(b) + tol, inY = p[1] >= b.y - tol && p[1] <= B(b) + tol;
  return (inX && (Math.abs(p[1] - b.y) <= tol || Math.abs(p[1] - B(b)) <= tol)) || (inY && (Math.abs(p[0] - b.x) <= tol || Math.abs(p[0] - R(b)) <= tol));
}

function segments(w: WireRec): [Pt, Pt][] { return w.pts.slice(1).map((p, i) => [w.pts[i], p]); }

function segmentCross(a: [Pt, Pt], b: [Pt, Pt]): 'none' | 'cross' | 'overlap' {
  const [p, p2] = a, [q, q2] = b;
  const rx = p2[0] - p[0], ry = p2[1] - p[1], sx = q2[0] - q[0], sy = q2[1] - q[1];
  const den = rx * sy - ry * sx, qpx = q[0] - p[0], qpy = q[1] - p[1];
  if (Math.abs(den) < 1e-9) {
    if (Math.abs(qpx * ry - qpy * rx) > 1e-6) return 'none';
    const rr = rx * rx + ry * ry, t0 = (qpx * rx + qpy * ry) / rr, t1 = t0 + (sx * rx + sy * ry) / rr;
    return Math.min(1, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) > 1e-3 ? 'overlap' : 'none';
  }
  const t = (qpx * sy - qpy * sx) / den, u = (qpx * ry - qpy * rx) / den, e = 1e-3;
  return t > e && t < 1 - e && u > e && u < 1 - e ? 'cross' : 'none';
}

export function audit(scene: Scene): { findings: Finding[]; stats: Record<string, number> } {
  const T = scene.theme, out: Finding[] = [];
  const add = (level: Finding['level'], rule: string, ids: string[], detail: string) => out.push({ level, rule, ids, detail });
  const items = scene.items, labels = items.filter(i => i.kind === 'label');
  const solids = items.filter(i => i.kind !== 'region' && i.kind !== 'label');
  const byId = new Map(items.map(i => [i.id, i]));
  const canvas: Box = { x: 0, y: 0, w: scene.width, h: scene.height };

  for (const i of items) if (!contains(canvas, i.box)) add('error', 'out-of-canvas', [i.id], `box ${f(i.box.x)},${f(i.box.y)} ${f(i.box.w)}x${f(i.box.h)} leaves ${f(canvas.w)}x${f(canvas.h)}`);

  // Label size floor.
  for (const l of labels) if ((l.size ?? 0) < T.minPt) add('error', 'font-too-small', [l.id], `${l.size} pt < ${T.minPt} pt`);

  // Label against label.
  for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
    const o = overlap(labels[a].box, labels[b].box);
    if (o > 0.15) add('error', 'label-overlap', [labels[a].id, labels[b].id], `ink boxes overlap by ${f(o)} pt`);
    else if (overlap(grow(labels[a].box, T.clearance / 2), grow(labels[b].box, T.clearance / 2)) > 0) add('warn', 'label-tight', [labels[a].id, labels[b].id], `closer than ${T.clearance} pt`);
  }

  // Label against modules, tiles, operators, custom drawings.
  for (const l of labels) for (const s of solids) {
    if (overlap(l.box, s.box) <= 0.05) continue;
    if (l.inside === s.id) {
      if (!contains(s.box, l.box, 1.2)) add('error', 'content-overflow', [l.id, s.id], `content needs ${f(l.box.w)}x${f(l.box.h)} pt plus padding, module is ${f(s.box.w)}x${f(s.box.h)}`);
    } else if (!(s.kind === 'node' && contains(s.box, l.box, 0.8))) add('error', 'label-on-object', [l.id, s.id], 'label overlaps an object it does not belong to');
  }

  // A label may sit inside a region or outside it, not across its border.
  for (const l of labels) for (const g of items.filter(i => i.kind === 'region')) {
    if (overlap(l.box, g.box) > 0.3 && !contains(g.box, l.box)) add('error', 'label-on-border', [l.id, g.id], 'label straddles the border of a region or panel');
  }

  // Solid against solid (a custom drawing may sit inside its declared parent).
  for (let a = 0; a < solids.length; a++) for (let b = a + 1; b < solids.length; b++) {
    const A = solids[a], Bb = solids[b];
    if (A.inside === Bb.id || Bb.inside === A.id) continue;
    if (overlap(A.box, Bb.box) > 0.05) add('error', 'object-overlap', [A.id, Bb.id], 'boxes overlap');
  }

  // Wires.
  for (const w of scene.wires) {
    const segs = segments(w), first = w.pts[0], last = w.pts[w.pts.length - 1];
    for (const [end, id, which] of [[first, w.from, 'start'], [last, w.to, 'end']] as const) {
      if (!id) continue;
      const target = byId.get(id);
      if (!target) { add('error', 'wire-endpoint', [w.id], `${which} names unknown item "${id}"`); continue; }
      if (!onBorder(end, target, 0.35)) add('error', 'wire-endpoint', [w.id, id], `${which} ${f(end[0])},${f(end[1])} is not on the border of ${id}`);
    }
    const tail = segs[segs.length - 1];
    const tailLen = Math.hypot(tail[1][0] - tail[0][0], tail[1][1] - tail[0][1]);
    if (w.arrow && tailLen < w.headLength + 1.5) add('warn', 'arrow-stub', [w.id], `last segment is ${f(tailLen)} pt, shorter than the arrow head plus 1.5 pt`);
    for (const [p, q] of segs) {
      for (const l of labels) if (insideLength(p, q, grow(l.box, T.clearance)) > 0.05) add('error', 'wire-through-label', [w.id, l.id], 'wire passes through or within clearance of a label');
      for (const s of solids) {
        if (w.cross.includes(s.id)) continue;
        const own = s.id === w.from || s.id === w.to;
        const len = insideLength(p, q, grow(s.box, own ? -0.4 : 0));
        if (len > (own && s.round ? s.box.w / 2 : 0.05)) add('error', own ? 'wire-into-endpoint' : 'wire-through-object', [w.id, s.id], `${f(len)} pt of the wire lies inside ${s.id}`);
      }
    }
  }
  for (let a = 0; a < scene.wires.length; a++) for (let b = a + 1; b < scene.wires.length; b++) {
    const A = scene.wires[a], Bw = scene.wires[b];
    let kind: 'none' | 'cross' | 'overlap' = 'none';
    for (const s of segments(A)) for (const t of segments(Bw)) { const k = segmentCross(s, t); if (k === 'overlap' || (k === 'cross' && kind === 'none')) kind = k; }
    const allowed = A.cross.includes(Bw.id) || Bw.cross.includes(A.id);
    if (kind === 'overlap' && !allowed) add('error', 'wire-overlap', [A.id, Bw.id], 'two wires share a collinear stretch');
    if (kind === 'cross' && !allowed) add('error', 'wire-crossing', [A.id, Bw.id], 'undeclared crossing; reroute or list it in `cross`');
  }

  // Near-miss alignment: edges or centres that differ by a fraction of a point were meant to match.
  const anchors = items.filter(i => i.kind === 'node' || i.kind === 'image' || i.kind === 'op');
  const keys: [string, (b: Box) => number][] = [['left', b => b.x], ['right', R], ['top', b => b.y], ['bottom', B], ['centre-x', b => b.x + b.w / 2], ['centre-y', b => b.y + b.h / 2]];
  // Only items in the same container are compared: blocks in different panels are laid out independently.
  const regions = items.filter(i => i.kind === 'region').sort((p, q) => p.box.w * p.box.h - q.box.w * q.box.h);
  const home = new Map(anchors.map(i => [i.id, regions.find(g => contains(g.box, i.box))?.id ?? '']));
  for (let a = 0; a < anchors.length; a++) for (let b = a + 1; b < anchors.length; b++) for (const [name, get] of keys) {
    if (home.get(anchors[a].id) !== home.get(anchors[b].id)) continue;
    // Operator circles are compared by centre only; their edges align with nothing by design.
    if ((anchors[a].kind === 'op' || anchors[b].kind === 'op') && !name.startsWith('centre')) continue;
    const d = Math.abs(get(anchors[a].box) - get(anchors[b].box));
    if (d > 0.05 && d < 0.7) add('warn', 'near-miss-alignment', [anchors[a].id, anchors[b].id], `${name} differs by ${f(d)} pt`);
  }

  // Size groups: modules declared as peers share one height.
  const groups = new Map<string, Item[]>();
  for (const i of items) if (i.group) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  for (const [g, members] of groups) {
    const hs = members.map(m => m.box.h);
    if (Math.max(...hs) - Math.min(...hs) > 0.05) add('error', 'size-group', members.map(m => m.id), `group "${g}" heights ${hs.map(f).join(', ')}`);
  }

  const sizes = labels.map(l => l.size ?? 0);
  return {
    findings: out,
    stats: { labels: labels.length, images: items.filter(i => i.kind === 'image').length, nodes: items.filter(i => i.kind === 'node').length, wires: scene.wires.length, minLabelPt: Math.min(...sizes), maxLabelPt: Math.max(...sizes) },
  };
}
