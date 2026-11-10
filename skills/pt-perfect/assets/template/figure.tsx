// Minimal starting point: replace the content, keep the pattern.
// Measure -> derive positions from measured boxes -> connect ports -> return height.
import { defineFigure, cx, cy, right, bottom, port, r, type Scene } from './kit';

export default defineFigure({
  name: 'figure',
  widthMM: 174, // final printed width; read it from the target template
  title: 'Short title for accessibility',
  desc: 'One or two sentences saying what the figure shows.',
  // assets: { input: 'assets/input.png' },
  // hashes: { input: '<sha256>' },
  draw,
});

function draw(s: Scene): number {
  const T = s.theme, X0 = 0.4, W = s.width - 0.4;
  const head = s.label('title', '(a) Panel title', { x: X0, y: 0.5, ax: 'l', ay: 'top', size: T.size.title, bold: true });

  // Peers share one height: measure them all first.
  const specs = [
    { tone: 'grey', lines: ['Encoder $f$'] },
    { tone: 'orange', lines: ['Predictor $g_\\phi(x_t, t)$'] },
    { tone: 'neutral', lines: ['Output $\\hat{x}_0^{(K)}$'] },
  ];
  const h = Math.max(...specs.map(n => s.measureNode(n).h));
  const y = bottom(head) + 8, widths = specs.map(n => s.measureNode(n).w);
  const gap = (W - X0 - widths.reduce((a, b) => a + b, 0)) / (specs.length - 1);
  let x = X0;
  const boxes = specs.map((n, i) => { const b = s.node(`n${i}`, { ...n, x, y, h, group: 'row' }); x = right(b) + gap; return b; });

  s.wire('w0', [port(boxes[0], 'right'), port(boxes[1], 'left')], { from: 'n0', to: 'n1' });
  s.wire('w1', [port(boxes[1], 'right'), port(boxes[2], 'left')], { from: 'n1', to: 'n2', tone: 'orange' });
  s.label('w1.t', s.line('residual $r$', { size: T.size.note, color: T.muted }), { x: (right(boxes[1]) + boxes[2].x) / 2, y: cy(boxes[1]) - 2.4, ay: 'inkBottom' });
  s.caption('n0.cap', [s.line('frozen', { size: T.size.note, color: T.muted })], { x: cx(boxes[0]), y: bottom(boxes[0]) + 3.4 });

  return r(bottom(boxes[0]) + 12);
}
