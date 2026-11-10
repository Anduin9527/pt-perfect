// Named theme presets. A preset changes colours, type and line treatment only:
// tone names (neutral, grey, blue, green, orange, purple, red) are semantic slots
// that every preset fills, so a figure switches theme without touching its source.
import type { Theme, Tone } from './theme';

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const blend = (a: string, b: string, t: number) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Tone from one base colour: pale fill, base stroke and line, darkened text. */
export const ramp = (base: string, o: { fill?: number; text?: number; paper?: string } = {}): Tone =>
  ({ fill: blend(base, o.paper ?? '#FFFFFF', o.fill ?? 0.88), stroke: base, text: blend(base, '#000000', o.text ?? 0.32), line: base });

const mac = '/System/Library/Fonts/Supplemental/', linux = '/usr/share/fonts/truetype/liberation/';
const sans = (t: Theme) => {
  t.fontFamily = 'Arial, Helvetica, "Liberation Sans", "Nimbus Sans", sans-serif';
  t.fontFiles = {
    regular: [mac + 'Arial.ttf', linux + 'LiberationSans-Regular.ttf'],
    bold: [mac + 'Arial Bold.ttf', linux + 'LiberationSans-Bold.ttf'],
    italic: [mac + 'Arial Italic.ttf', linux + 'LiberationSans-Italic.ttf'],
  };
};
const palette = (t: Theme, ink: string, c: { grey: string; blue: string; green: string; orange: string; purple: string; red: string }, o: { fill?: number; text?: number } = {}) => {
  t.ink = ink; t.muted = blend(ink, '#FFFFFF', 0.3); t.hairline = blend(ink, '#FFFFFF', 0.76);
  t.tones = {
    neutral: { fill: t.paper, stroke: blend(ink, '#FFFFFF', 0.25), text: ink, line: blend(ink, '#FFFFFF', 0.15) },
    grey: { fill: blend(c.grey, '#FFFFFF', 0.86), stroke: c.grey, text: blend(c.grey, '#000000', 0.35), line: c.grey },
    blue: ramp(c.blue, o), green: ramp(c.green, o), orange: ramp(c.orange, o), purple: ramp(c.purple, o), red: ramp(c.red, o),
  };
};

export const themes: Record<string, (t: Theme) => void> = {
  /** Default: low-saturation semantic ramps, Times, soft corners. */
  soft: () => {},
  /** Journal style: sans-serif at 5-7 pt, one dark ink, thin lines, restrained NPG-like hues. */
  nature: t => {
    sans(t);
    palette(t, '#1A1A1A', { grey: '#7E8791', blue: '#3C5488', green: '#00A087', orange: '#E18727', purple: '#7E6148', red: '#DC4B37' }, { fill: 0.86, text: 0.25 });
    t.tones.purple = ramp('#8491B4', { fill: 0.84, text: 0.4 });
    // A white-blended navy reads as grey at print size; give the fill a clearer blue cast.
    t.tones.blue.fill = '#E1E9F4'; t.tones.grey.fill = blend('#7E8791', '#FFFFFF', 0.9);
    t.size = { title: 7, label: 6.5, note: 6 }; t.minPt = 5;
    t.stroke = { node: 0.5, wire: 0.5, hair: 0.3 }; t.radius = 1.2; t.wireRadius = 1.4; t.arrow = { length: 3.2, width: 2.5 };
  },
  /** Formal mechanism: dark neutral context, one blue accent, near-square corners. */
  formal: t => {
    // Secondary tones are desaturated (slate green, taupe, slate violet) so blue stays the only accent
    // while every tone remains distinguishable from grey and from each other.
    palette(t, '#1F2933', { grey: '#7B8794', blue: '#1F5FA8', green: '#5C7A6E', orange: '#8A7560', purple: '#6A6585', red: '#B03A2E' }, { fill: 0.82 });
    t.tones.grey = { ...t.tones.grey, fill: blend('#7B8794', '#FFFFFF', 0.9) };
    t.tones.blue = ramp('#1F5FA8', { fill: 0.84 });
    t.radius = 0.6; t.wireRadius = 1; t.stroke = { node: 0.6, wire: 0.6, hair: 0.35 };
  },
  /** Ceramic: teal and terracotta accents on pale warm fills. */
  ceramic: t => {
    t.paper = '#FFFFFF';
    palette(t, '#33302C', { grey: '#9A948B', blue: '#3F7C85', green: '#6B8F71', orange: '#C2693D', purple: '#8A6F92', red: '#B4514A' }, { fill: 0.86 });
    // Warm only the context tone; warming the accents turns the teal fill muddy.
    t.tones.grey.fill = blend(t.tones.grey.fill, '#FFF4E6', 0.5);
    t.radius = 3;
  },
  /** Okabe-Ito hues: distinguishable under the common colour-vision deficiencies. */
  'okabe-ito': t => {
    palette(t, '#222222', { grey: '#8C8C8C', blue: '#0072B2', green: '#009E73', orange: '#D98C00', purple: '#CC79A7', red: '#D55E00' }, { fill: 0.87, text: 0.3 });
  },
  /** Greyscale: checks that the figure survives black-and-white printing. */
  mono: t => {
    t.ink = '#1A1A1A'; t.muted = '#555555'; t.hairline = '#C8C8C8';
    const g = (fill: string, stroke: string): Tone => ({ fill, stroke, text: '#1A1A1A', line: stroke });
    // Tones differ in fill lightness and stroke weight of grey; panels mix the fill 50% with paper, so the steps are wide.
    t.tones = { neutral: g('#FFFFFF', '#444444'), grey: g('#F5F5F5', '#8A8A8A'), blue: g('#E0E0E0', '#3A3A3A'), green: g('#EBEBEB', '#5A5A5A'), orange: g('#BDBDBD', '#000000'), purple: g('#D2D2D2', '#6E6E6E'), red: g('#A6A6A6', '#000000') };
  },
};

export type ThemeInput = string | ((t: Theme) => void) | (string | ((t: Theme) => void))[];

/** Apply presets and adjustments in order. `override` (the CLI's --theme) replaces the named presets and keeps the functions. */
export function applyTheme(t: Theme, input: ThemeInput | undefined, override?: string) {
  let steps = input === undefined ? [] : Array.isArray(input) ? input : [input];
  if (override) steps = [override, ...steps.filter(s => typeof s !== 'string')];
  for (const s of steps) {
    if (typeof s === 'function') { s(t); continue; }
    const preset = themes[s];
    if (!preset) throw new Error(`Unknown theme "${s}". Available: ${Object.keys(themes).join(', ')}`);
    preset(t);
  }
}
