// Module figure: a Vision Transformer opened up in three layers.
// (a) the whole network, (b) one encoder block, (c) the attention operator inside it.
// Colour marks the block type across layers: blue = encoder block, orange = self-attention.
import { defineFigure, bottom, cx, cy, right, type Scene } from './kit';

export default defineFigure({
  name: 'module',
  widthMM: 174,
  title: 'Vision Transformer, expanded layer by layer',
  desc: 'Overview of a Vision Transformer; one pre-norm encoder block with its two residual branches; multi-head self-attention expanded to its operators.',
  theme: t => { t.size = { title: 7.5, label: 7, note: 6.2 }; },
  draw,
});

function draw(s: Scene): number {
  const W = s.width, P = 0.5, NH = 10.6;
  const box = (id: string, text: string, x: number, yc: number, w: number, tone = 'neutral', bold = false) => s.node(id, { lines: [text], tone, x, cy: yc, w, h: NH, size: 6.5, bold });
  const note = (id: string, text: string, x: number, y: number, ax: 'l' | 'c' | 'r' = 'c', ay: 'mid' | 'inkTop' | 'inkBottom' = 'mid') => s.label(id, text, { x, y, ax, ay, size: 6.2, color: s.theme.muted });
  const sym = (id: string, tex: string, x: number, y: number, ay: 'mid' | 'inkBottom' = 'mid') => s.label(id, `$${tex}$`, { x, y, ax: 'c', ay, size: 7 });

  // ───────── (a) overview: one row, the repeated stage drawn once ─────────
  const PA = s.panel('a', { x: P, y: P, w: W - 2 * P, h: 38 }, { title: '(a) Vision Transformer', tone: 'grey' });
  s.legend('a.legend', [{ text: 'Encoder block (b)', swatch: 'blue' }, { text: 'Self-attention (c)', swatch: 'orange' }, { text: 'residual add', op: 'add' }], { x: right(PA) - 6, y: PA.y + 8, ax: 'r', dir: 'row' });
  const ya = PA.y + 24;
  box('a.img', 'Image', 8, ya, 34); box('a.pe', 'Patch embed', 70, ya, 54);
  const pos = s.op('a.pos', 'add', { cx: 156, cy: ya });
  const blk = box('a.blk', 'Encoder block', 188, ya, 70, 'blue', true);
  box('a.ln', 'LayerNorm', 300, ya, 50); const head = box('a.head', 'MLP head', 386, ya, 50);
  s.link('a.img', 'a.pe'); s.link('a.pe', 'a.pos'); s.link('a.pos', 'a.blk'); s.link('a.blk', 'a.ln'); s.link('a.ln', 'a.head');
  s.wire('a.out', [[right(head), ya], [right(head) + 16, ya]], { from: 'a.head' });
  sym('a.y', '\\hat{y}', right(head) + 22, ya);
  s.wire('a.pos.w', [[cx(pos), ya - 11.5], [cx(pos), pos.y]], { to: 'a.pos' });
  s.label('a.pos.t', '$E_{\\mathrm{pos}}$', { x: cx(pos) + 3, y: ya - 9, ax: 'l', ay: 'mid', size: 6.5 });
  note('a.L', '$\\times L$', right(blk) + 3, ya - 7, 'l');

  // ───────── (b) encoder block: pre-norm, two residual branches ─────────
  const PB = s.panel('b', { x: P, y: bottom(PA) + 8, w: 215, h: 60 }, { title: '(b) Encoder block', tone: 'blue' });
  s.zoom('zoom.b', blk, PB, { tone: 'blue' });
  const yb = PB.y + 38, X = (v: number) => PB.x + v;
  sym('b.x', 'x', X(7), yb);
  box('b.ln1', 'LN', X(28), yb, 20); box('b.attn', 'MHSA (c)', X(56), yb, 42, 'orange');
  const add1 = s.op('b.add1', 'add', { cx: X(113), cy: yb });
  box('b.ln2', 'LN', X(134), yb, 20); box('b.mlp', 'MLP', X(162), yb, 24);
  const add2 = s.op('b.add2', 'add', { cx: X(199), cy: yb });
  s.wire('b.in', [[X(11.5), yb], [X(28), yb]], { to: 'b.ln1' });
  s.link('b.ln1', 'b.attn'); s.link('b.attn', 'b.add1'); s.link('b.add1', 'b.ln2'); s.link('b.ln2', 'b.mlp'); s.link('b.mlp', 'b.add2');
  s.wire('b.out', [[right(add2), yb], [X(211), yb]], { from: 'b.add2' });
  // Residual branches run above the main path and re-enter at the adders.
  s.wire('b.res1', [[X(19), yb], [X(19), yb - 15], [cx(add1), yb - 15], [cx(add1), add1.y]], { to: 'b.add1', tone: 'grey' }); s.dot([X(19), yb]);
  s.wire('b.res2', [[X(124.5), yb], [X(124.5), yb - 15], [cx(add2), yb - 15], [cx(add2), add2.y]], { to: 'b.add2', tone: 'grey' }); s.dot([X(124.5), yb]);
  note('b.mlp.n', '$d{\\to}4d{\\to}d$', X(174), yb + NH / 2 + 2.5, 'c', 'inkTop');

  // ───────── (c) attention: rows for q, k, v ─────────
  const PC = s.panel('c', { x: right(PB) + 6, y: PB.y, w: W - P - right(PB) - 6, h: PB.h }, { title: '(c) Multi-head self-attention', tone: 'orange' });
  const C = (v: number) => PC.x + v, yq = PC.y + 24, yk = yq + 12, yv = yk + 12, fx = C(60);
  sym('c.x', 'x', C(8), yk);
  const qkv = box('c.qkv', 'Linear', C(22), yk, 30);
  s.wire('c.in', [[C(12.5), yk], [qkv.x, yk]], { to: 'c.qkv' });
  note('c.qkv.n', '$d{\\to}3d$', cx(qkv), bottom(qkv) + 2.5, 'c', 'inkTop');
  const qk = s.node('c.qk', { lines: ['$QK^{\\top}/\\sqrt{d_k}$'], tone: 'orange', x: C(86), y: yq - NH / 2, w: 54, h: yk - yq + NH, size: 6.5 });
  const sm = box('c.sm', 'Softmax', C(156), cy(qk), 38);
  const mul = s.op('c.mul', 'mul', { cx: C(214), cy: cy(qk) });
  const proj = box('c.proj', 'Linear', C(232), cy(qk), 28);
  s.wire('c.k', [[right(qkv), yk], [qk.x, yk]], { from: 'c.qkv', to: 'c.qk' });
  s.wire('c.q', [[fx, yk], [fx, yq], [qk.x, yq]], { to: 'c.qk' });
  s.wire('c.v', [[fx, yk], [fx, yv], [cx(mul), yv], [cx(mul), bottom(mul)]], { to: 'c.mul' }); s.dot([fx, yk]);
  sym('c.q.t', 'Q', C(73), yq - 1.8, 'inkBottom'); sym('c.k.t', 'K', C(73), yk - 1.8, 'inkBottom'); sym('c.v.t', 'V', C(73), yv - 1.8, 'inkBottom');
  s.link('c.qk', 'c.sm'); s.link('c.sm', 'c.mul'); s.link('c.mul', 'c.proj');
  s.wire('c.out', [[right(proj), cy(qk)], [right(PC) - 3, cy(qk)]], { from: 'c.proj' });
  note('c.note', '$h$ heads in parallel, $d_k=d/h$', right(PC) - 6, PC.y + 8, 'r');
  return bottom(PB) + P;
}
