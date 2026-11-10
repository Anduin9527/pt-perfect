// Mechanism figure: how three operators gather context for one output token.
// One scene (an input feature map below, an output map above, one highlighted output token),
// drawn three times with a single change: which input tokens reach that output, and how.
// Everything here is schematic except the counts in the notes (k^2, N, O(N)).
import { defineFigure, bottom, mix, Space, seeded, type Box, type Scene, type V3 } from './kit';

const N = 7, GAPZ = 4.4, TARGET: [number, number] = [4, 3];
const corner = (i: number, j: number, z: number): V3 => [i - N / 2, j - N / 2, z];
const centre = (i: number, j: number, z: number): V3 => corner(i + 0.5, j + 0.5, z);

export default defineFigure({
  name: 'mechanism',
  widthMM: 174,
  title: 'How convolution, self-attention and a state-space scan gather context',
  desc: 'Three views of the same pair of feature maps. Convolution feeds one output token from a local window; self-attention from all tokens with content-dependent weights; a state-space scan from a running state that has visited the tokens in order.',
  theme: t => { t.size = { title: 7.5, label: 7, note: 6.2 }; },
  draw,
});

function draw(s: Scene): number {
  const W = s.width, P = 0.5, GAP = 5, PW = (W - 2 * P - 2 * GAP) / 3, PH = 128;
  const CAM = { azimuth: -58, elevation: 30, scale: 10.5 };
  const rand = seeded(5), weights = Array.from({ length: N * N }, () => rand() ** 3); // attention weights: schematic

  const scene = (id: string, tone: string, title: string, noteText: string, x: number, input: (i: number, j: number) => number, extra: (sp: Space, line: string) => void) => {
    const T = s.tone(tone), pb = s.panel(id, { x, y: P, w: PW, h: PH }, { title, tone, fill: '#FFFFFF' });
    const probe = new Space({ box: { x: 0, y: 0, w: 0, h: 0 }, ...CAM });
    const ext = [0, GAPZ].flatMap(z => [corner(0, 0, z), corner(N, 0, z), corner(0, N, z), corner(N, N, z)]).map(p => probe.at(p));
    const ys = ext.map(p => p[1]), xs = ext.map(p => p[0]);
    const inner: Box = { x: pb.x + 2, y: pb.y + 13, w: pb.w - 4, h: pb.h - 26 };
    const sp = new Space({ box: { x: inner.x + inner.w / 2 - (Math.min(...xs) + Math.max(...xs)) / 2, y: inner.y + inner.h / 2 - (Math.min(...ys) + Math.max(...ys)) / 2, w: 0, h: 0 }, ...CAM });
    const grid = (z: number, fill: (i: number, j: number) => string, opacity?: (i: number, j: number) => number) => {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
        sp.polygon([corner(i, j, z), corner(i + 1, j, z), corner(i + 1, j + 1, z), corner(i, j + 1, z)], { fill: fill(i, j), opacity: opacity?.(i, j), stroke: '#9AA6B1', width: 0.3 });
    };
    grid(0, (i, j) => mix('#F5F7F9', T.line, input(i, j)));
    // The output map is translucent so the lines that arrive from below stay visible.
    grid(GAPZ, (i, j) => i === TARGET[0] && j === TARGET[1] ? T.line : '#F5F7F9', (i, j) => i === TARGET[0] && j === TARGET[1] ? 1 : 0.55);
    extra(sp, T.line);
    s.raw(`${id}.space`, sp.render(), inner, { kind: 'region' });
    const lo = sp.at(corner(0, 0, 0)), hi = sp.at(corner(0, 0, GAPZ));
    s.label(`${id}.in`, 'input', { x: lo[0] - 3, y: lo[1] + 1, ax: 'r', ay: 'mid', size: 6.2, color: s.theme.muted });
    s.label(`${id}.out`, 'output', { x: hi[0] - 3, y: hi[1] + 1, ax: 'r', ay: 'mid', size: 6.2, color: s.theme.muted });
    s.label(`${id}.note`, noteText, { x: pb.x + pb.w / 2, y: bottom(pb) - 7.5, ax: 'c', ay: 'mid', size: 6.2, color: T.text });
  };
  const out = centre(TARGET[0], TARGET[1], GAPZ);

  // (a) convolution: a 3x3 window under the output token
  const inWin = (i: number, j: number) => Math.abs(i - TARGET[0]) <= 1 && Math.abs(j - TARGET[1]) <= 1;
  scene('a', 'blue', '(a) Convolution: local window', '$k^2$ neighbours, fixed weights', P, (i, j) => inWin(i, j) ? 0.55 : 0, (sp, line) => {
    for (const [di, dj] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) sp.curve([corner(TARGET[0] + di, TARGET[1] + dj, 0), out], { color: line, width: 0.5, opacity: 0.9 });
    sp.curve([-1, 2, 2, -1, -1].map((d, n) => corner(TARGET[0] + d, TARGET[1] + [-1, -1, 2, 2, -1][n], 0)), { color: line, width: 0.7, bias: 1 });
  });

  // (b) self-attention: every token, weighted by content
  scene('b', 'orange', '(b) Self-attention: all tokens', '$N$ tokens, content-dependent weights', P + PW + GAP, (i, j) => 0.12 + 0.75 * weights[i * N + j], (sp, line) => {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) sp.curve([centre(i, j, 0), out], { color: line, width: 0.25 + 0.7 * weights[i * N + j], opacity: 0.25 + 0.7 * weights[i * N + j] });
  });

  // (c) state-space scan: a running state visits the tokens in order
  const order: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let n = 0; n < N; n++) order.push([j % 2 ? N - 1 - n : n, j]);
  const stop = order.findIndex(([i, j]) => i === TARGET[0] && j === TARGET[1]);
  const visited = new Map(order.slice(0, stop + 1).map(([i, j], n) => [`${i},${j}`, n]));
  scene('c', 'green', '(c) State-space scan: ordered state', 'one pass, $O(N)$; later tokens unseen', P + 2 * (PW + GAP), (i, j) => visited.has(`${i},${j}`) ? 0.12 + 0.6 * Math.exp(-(stop - visited.get(`${i},${j}`)!) / 9) : 0, (sp, line) => {
    sp.curve(order.slice(0, stop + 1).map(([i, j]) => centre(i, j, 0)), { color: line, width: 0.7, arrow: 3.2, bias: 1 });
    sp.curve([centre(TARGET[0], TARGET[1], 0), [out[0], out[1], out[2] - 0.25]], { color: line, width: 0.8, arrow: 3.6 });
  });
  return P + PH + P;
}
