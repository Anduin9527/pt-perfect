// Theme: every length is in printed points (pt). The SVG viewBox uses the same
// unit, so `size: 7.5` is 7.5 pt on paper and `stroke: 0.6` is a 0.6 pt line.

export type Tone = { fill: string; stroke: string; text: string; line: string };

export type Theme = {
  ink: string;        // body text
  muted: string;      // secondary notes
  hairline: string;   // rules, tile frames
  paper: string;
  tones: Record<string, Tone>;
  fontFamily: string; // CSS stack written into the SVG
  fontFiles: Record<'regular' | 'bold' | 'italic', string[]>; // first existing file is used for measuring
  /** Extra fonts for glyphs the primary lacks (e.g. CJK), in CSS fallback order. Use "file.ttc#PostScriptName" for collections. */
  fallbackFonts?: Partial<Record<'regular' | 'bold' | 'italic', string[]>>;
  size: { title: number; label: number; note: number };
  minPt: number;      // audit: smallest allowed label size
  stroke: { node: number; wire: number; hair: number };
  radius: number;     // node corner radius
  wireRadius: number; // elbow radius
  arrow: { length: number; width: number };
  pad: { x: number; y: number };   // node padding around content ink
  clearance: number;               // audit: wire-to-label / label-to-label distance
};

const mac = '/System/Library/Fonts/Supplemental/';
const linux = '/usr/share/fonts/';

// Low-saturation semantic ramps (fill / stroke / deep text / arrow line).
export const defaultTheme: Theme = {
  ink: '#2F3742',
  muted: '#5B6670',
  hairline: '#CBD3DA',
  paper: '#FFFFFF',
  tones: {
    neutral: { fill: '#FFFFFF', stroke: '#5B6670', text: '#2F3742', line: '#4A545E' },
    grey:    { fill: '#F2F5F7', stroke: '#8B98A4', text: '#5B6670', line: '#8B98A4' },
    blue:    { fill: '#EAF3FA', stroke: '#4F7FA8', text: '#2F5F88', line: '#2F6FAE' },
    green:   { fill: '#EAF7F4', stroke: '#5B958A', text: '#2F6F65', line: '#4C8C82' },
    orange:  { fill: '#FFF2E7', stroke: '#B9793E', text: '#8A5528', line: '#B9793E' },
    purple:  { fill: '#F3EEFB', stroke: '#8269B0', text: '#60458E', line: '#7C5FB2' },
    red:     { fill: '#FBEDED', stroke: '#B85F5F', text: '#8F3E3E', line: '#B85F5F' },
  },
  fontFamily: '"Times New Roman", Times, "Nimbus Roman", "TeX Gyre Termes", "Liberation Serif", serif',
  fontFiles: {
    regular: [mac + 'Times New Roman.ttf', linux + 'truetype/liberation/LiberationSerif-Regular.ttf', linux + 'opentype/urw-base35/NimbusRoman-Regular.otf'],
    bold: [mac + 'Times New Roman Bold.ttf', linux + 'truetype/liberation/LiberationSerif-Bold.ttf', linux + 'opentype/urw-base35/NimbusRoman-Bold.otf'],
    italic: [mac + 'Times New Roman Italic.ttf', linux + 'truetype/liberation/LiberationSerif-Italic.ttf', linux + 'opentype/urw-base35/NimbusRoman-Italic.otf'],
  },
  size: { title: 8.5, label: 7.5, note: 6.5 },
  minPt: 6,
  stroke: { node: 0.7, wire: 0.7, hair: 0.4 },
  radius: 2.2,
  wireRadius: 2,
  arrow: { length: 3.8, width: 3 },
  pad: { x: 5, y: 3.2 },
  clearance: 1,
};

export const MM = 72 / 25.4; // pt per mm
