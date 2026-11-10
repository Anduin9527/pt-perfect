// Measure text and TeX before anything is placed. Layout code asks "how big is
// this label" first and derives box sizes and positions from the answer.
import fs from 'node:fs';
import * as fontkit from 'fontkit';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import type { Theme } from './theme';

export type Style = 'regular' | 'bold' | 'italic';
/** Extents around the baseline origin, in pt. `asc`/`desc` are ink, not em-box. */
export type Ink = { w: number; asc: number; desc: number };
export type Part =
  | ({ kind: 'text'; text: string; style: Style } & Ink)
  | ({ kind: 'math'; tex: string; body: string } & Ink);
/** One line of mixed text and inline math sharing a baseline. */
export type Line = Ink & { parts: Part[]; size: number; cap: number; color?: string; source: string };

const fonts: Partial<Record<Style, any[]>> = {}; // primary first, then fallbacks
export const fontReport: Record<string, string[]> = {};

function open(ref: string) {
  const [file, name] = ref.split('#');
  const f: any = fontkit.openSync(file);
  if (!f.fonts) return f;
  const hit = name ? f.fonts.find((x: any) => x.postscriptName === name) : f.fonts[0];
  if (!hit) throw new Error(`"${name}" is not in ${file}; it holds ${f.fonts.map((x: any) => x.postscriptName).join(', ')}`);
  return hit;
}

export function initFonts(theme: Theme) {
  for (const style of ['regular', 'bold', 'italic'] as Style[]) {
    const exists = (ref: string) => fs.existsSync(ref.split('#')[0]);
    const primary = theme.fontFiles[style].find(exists);
    if (!primary) throw new Error(`No font file found for "${style}". Add one to theme.fontFiles.${style}.`);
    const refs = [primary, ...(theme.fallbackFonts?.[style] ?? theme.fallbackFonts?.regular ?? []).filter(exists)];
    fonts[style] = refs.map(open);
    fontReport[style] = refs;
  }
}

const isCJK = (s: string) => /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(s);

/** Optical height used for vertical centring: cap height for Latin, the ideographic body for CJK. */
export function capHeight(size: number, text = '') {
  if (isCJK(text)) return size * 0.76;
  const f = fonts.regular![0];
  return (f.capHeight || f.ascent * 0.7) * size / f.unitsPerEm;
}

/** Split into runs by the first font that has each glyph, as a browser's fallback does. */
function runs(text: string, list: any[]): { font: any; text: string }[] {
  const out: { font: any; text: string }[] = [];
  for (const ch of text) {
    const font = list.find(f => f.hasGlyphForCodePoint(ch.codePointAt(0)!)) ?? list[0];
    const last = out[out.length - 1];
    if (last && (last.font === font || ch === ' ')) last.text += ch; else out.push({ font, text: ch });
  }
  return out;
}

export function measureText(text: string, size: number, style: Style = 'regular'): Ink {
  const list = fonts[style];
  if (!list) throw new Error('initFonts(theme) must run before measuring');
  let w = 0, asc = 0, desc = 0;
  for (const part of runs(text, list)) {
    const run = part.font.layout(part.text), k = size / part.font.unitsPerEm, box = run.bbox;
    w += run.advanceWidth * k;
    if (isFinite(box.minY) && isFinite(box.maxY)) { asc = Math.max(asc, box.maxY * k); desc = Math.max(desc, -box.minY * k); }
  }
  return { w, asc, desc };
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mjDocument = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) });
const mathCache = new Map<string, { body: string; w: number; asc: number; desc: number }>();

/** Vector math with its real height and depth; the unit is em until scaled by `size`. */
export function measureMath(tex: string, size: number): Ink & { body: string } {
  let m = mathCache.get(tex);
  if (!m) {
    const node = mjDocument.convert(tex, { display: false });
    const svg = adaptor.tags(node, 'svg')[0];
    const body = adaptor.innerHTML(svg);
    if (body.includes('data-mml-node="merror"')) throw new Error(`TeX error in: ${tex}`);
    const [, minY, w, h] = adaptor.getAttribute(svg, 'viewBox')!.split(/\s+/).map(Number);
    m = { body, w: w / 1000, asc: -minY / 1000, desc: (minY + h) / 1000 };
    mathCache.set(tex, m);
  }
  return { body: m.body, w: m.w * size, asc: m.asc * size, desc: m.desc * size };
}

/**
 * "Anchor $a=f(y)$" -> one measured line. `$...$` is inline TeX, `*...*` is
 * italic text, everything else is upright text. Use `\color{#hex}{..}` inside
 * TeX to tint a single symbol.
 */
export function line(source: string, opts: { size: number; bold?: boolean; color?: string }): Line {
  const parts: Part[] = [];
  const base: Style = opts.bold ? 'bold' : 'regular';
  source.split(/(\$[^$]+\$)/).forEach(chunk => {
    if (!chunk) return;
    if (chunk.startsWith('$')) {
      const tex = chunk.slice(1, -1);
      parts.push({ kind: 'math', tex, ...measureMath(tex, opts.size) });
    } else {
      chunk.split(/(\*[^*]+\*)/).forEach(t => {
        if (!t) return;
        const italic = t.startsWith('*') && t.endsWith('*') && t.length > 2;
        const text = italic ? t.slice(1, -1) : t;
        const style = italic ? 'italic' : base;
        parts.push({ kind: 'text', text, style, ...measureText(text, opts.size, style) });
      });
    }
  });
  return {
    parts, size: opts.size, color: opts.color, source, cap: capHeight(opts.size, source.replace(/\$[^$]+\$/g, '')),
    w: parts.reduce((s, p) => s + p.w, 0),
    asc: Math.max(0, ...parts.map(p => p.asc)),
    desc: Math.max(0, ...parts.map(p => p.desc)),
  };
}
