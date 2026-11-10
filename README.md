<p align="center"><img src="docs/images/header.png" alt="pt-perfect" width="100%"></p>

<h1 align="center">pt-perfect</h1>

<p align="center">An agent skill for paper figures that are correct at the printed point.<br>
Pixel-perfect is for screens. Papers are <b>pt-perfect</b>.</p>

<p align="center"><a href="README.zh-CN.md">简体中文</a> · <a href="#install">Install</a> · <a href="#what-it-draws">Gallery</a> · <a href="#same-skill-different-models">Comparison</a> · <a href="LICENSE">MIT</a></p>

---

`pt-perfect` is a skill for coding agents (Claude Code, Codex, and other agents that load `SKILL.md` skills). It ships a small React + SVG toolkit and the design rules to use it, so an agent can turn a paper's text, equations and code into a method figure, an architecture breakdown or a mechanism figure, and hand back editable source plus a size-exact PDF, SVG and PNG.

Hand-written absolute coordinates are why generated figures keep breaking: a subscript pushes a formula out of its box, a label is centred by eye, a wire runs through text after one node moves. The kit removes those failures by construction:

- **Units are printed points.** The canvas is as wide as the figure will be printed (for example 174 mm). `size: 7.5` is 7.5 pt on paper.
- **Measure first, then place.** Text and TeX are measured with the real font files and MathJax before anything gets a position; positions come from neighbouring boxes.
- **A geometry audit, without a browser.** Overflow, label overlap, wires through objects, endpoints off their borders, short arrow tails, undersized text, near-miss alignment. Errors stop the export.
- **Checked export.** Chrome prints the vector PDF; the report records the exact page box, embedded fonts and the difference between measured and rendered text width.
- **Design rules, not only an API.** Three reference guides tell the agent how to compose each kind of figure and what to check by eye.

## What it draws

| Kind | Guide | Example source |
| --- | --- | --- |
| Method / framework figure | [`composition.md`](skills/pt-perfect/references/composition.md) | [`template/figure.tsx`](skills/pt-perfect/assets/template/figure.tsx) |
| Module figure: a network opened up layer by layer | [`module-figures.md`](skills/pt-perfect/references/module-figures.md) | [`vit-module.tsx`](skills/pt-perfect/assets/examples/vit-module.tsx) |
| Mechanism figure: the core idea, with vector 3D scenes | [`mechanism-figures.md`](skills/pt-perfect/references/mechanism-figures.md) | [`context-mechanism.tsx`](skills/pt-perfect/assets/examples/context-mechanism.tsx) |

**Mechanism figure** — one scene drawn three times with a single change per panel. The 3D is plain SVG paths (depth-sorted quads), so it stays vector and editable.

<p align="center"><img src="docs/images/example-mechanism.png" width="100%"></p>

**Module figure** — overview, block, operator; colour marks the block type across layers.

<p align="center"><img src="docs/images/example-module.png" width="100%"></p>

Both are 174 mm wide, pass the audit with 0 errors and 0 warnings, and are built from the example sources above.

## Same skill, different models

The task: recreate Fig. 2 of *3DSMT: A Hybrid Spiking Mamba-Transformer for Point Cloud Analysis* at 174 mm from the figure image alone. Topology, module names and signal names follow the original; colours, fonts and icons follow the skill's defaults.

<table>
<tr>
<td width="50%" align="center"><img src="docs/images/compare-3dsmt-original.jpg" width="100%"><br><b>Original</b> (paper figure)</td>
<td width="50%" align="center"><img src="docs/images/compare-3dsmt-claude.png" width="100%"><br><b>Claude Fable 5.2</b></td>
</tr>
<tr>
<td width="50%" align="center"><img src="docs/images/compare-3dsmt-codex.png" width="100%"><br><b>gpt-6.1-sol</b></td>
<td width="50%" align="center"><img src="docs/images/compare-3dsmt-omp.png" width="100%"><br><b>DeepSeek Flash 4.1</b></td>
</tr>
</table>

All three recreations are 174 mm wide and pass the audit with 0 errors and 0 warnings. The audit checks mechanical defects only, not topology; the differences below were found by looking at the figures.

- **Claude Fable 5.2** (via Claude Code, 174 × 106.9 mm): made while the module-figure primitives of this kit were being developed, so it is not a cold run. Hatched token columns are drawn solid.
- **gpt-6.1-sol** (via Codex CLI, 174 × 112.9 mm): a cold run of about 13 minutes. Chrome could not start inside the Codex sandbox, so the final PDF/PNG export was run afterwards on the unchanged source.
- **DeepSeek Flash 4.1** (model id `deepseek-flash`, via omp, 174 × 129.1 mm): a cold run of about 17 minutes costing about $0.21. It has visible deviations: the subtraction in the SLOA panel is drawn as an addition, the point-cloud crops keep fragments of the original's arrows, and two zoom callouts cross other panels.

Both cold runs started in a fresh directory that held only this skill and the reference image, with an instruction to read nothing else; their logs show no reads outside that directory. In all three, the point-cloud images are crops of the published figure, so their resolution is limited. The original figure belongs to its authors and is shown here only for comparison.

## Install

Copy the skill folder to where your agent looks for skills.

```sh
git clone https://github.com/Anduin9527/pt-perfect
# Claude Code (user-level; use .claude/skills/ inside a repo for project-level)
cp -R pt-perfect/skills/pt-perfect ~/.claude/skills/
# Codex
cp -R pt-perfect/skills/pt-perfect ~/.codex/skills/
```

Then ask for a figure: *"Use pt-perfect to draw the method figure for this paper at 174 mm."*

Requirements: Node.js 20 or newer; Google Chrome or Chromium for PDF/PNG export (set `CHROME_PATH` if it is not in a standard location); optionally poppler (`pdffonts`, `pdftoppm`) for the font-embedding check. `npm run build` (SVG + audit) needs no browser.

## Use the kit by hand

```sh
cp -R skills/pt-perfect/assets/template/. my-figure/ && cp -R skills/pt-perfect/assets/kit my-figure/kit
cd my-figure && npm install
npm run build     # SVG, exports/audit.json, exports/preview.html
npm run export    # PDF + PNG + exports/export-report.json
```

```tsx
import { defineFigure, port, right, type Scene } from './kit';

export default defineFigure({
  name: 'figure', widthMM: 174, title: 'Pipeline', desc: 'Encoder feeds the predictor.',
  draw(s: Scene) {
    const a = s.node('enc', { lines: ['Encoder $f_\\theta$'], tone: 'grey', x: 0.5, y: 0.5 });
    const b = s.node('pred', { lines: ['Predictor $g_\\phi(x_t, t)$'], tone: 'orange', x: right(a) + 40, y: 0.5, h: a.h });
    s.wire('w', [port(a, 'right'), port(b, 'left')], { from: 'enc', to: 'pred' });
    return a.h + 1; // figure height in pt
  },
});
```

To run an example, copy it over `figure.tsx`. The full API is in [`toolkit.md`](skills/pt-perfect/references/toolkit.md).

## Layout of this repository

```
skills/pt-perfect/
  SKILL.md              workflow and conventions the agent follows
  references/           composition, module figures, mechanism figures, toolkit API
  assets/kit/           the toolkit (measure, scene, space, audit, cli)
  assets/template/      starting project
  assets/examples/      complete figures
docs/images/            images used in this README
```

## Scope and limits

- For diagrams, not for quantitative plots (use matplotlib or similar and embed the result as a tile).
- The audit proves the absence of mechanical defects. Whether the figure is scientifically right, reads in a natural order and looks good still has to be judged by looking at it; the guides say what to look for.
- Items inside a 3D `Space` scene and zoom callouts are not audited.
- The skill's guides are written in Chinese; agents read them as they are. The code, comments and API names are in English.
- Tested on macOS with Node 24 and Google Chrome. Linux font fallbacks (Liberation Serif, Nimbus Roman) are configured but not tested.

## License

MIT. The header image was generated with an image model through the Codex CLI.
