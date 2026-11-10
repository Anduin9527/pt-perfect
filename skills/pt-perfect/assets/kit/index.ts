import type { Scene } from './scene';
import type { Theme } from './theme';

export type FigureSpec = {
  /** Base name of the exported files. */
  name: string;
  /** Final printed width. Column and text widths come from the target template. */
  widthMM: number;
  title: string;
  desc: string;
  /** Asset name -> image file, relative to the figure directory. */
  assets?: Record<string, string>;
  /** Optional sha256 per asset name; the build stops on a mismatch. */
  hashes?: Record<string, string>;
  /** Adjust the default theme (colours, sizes, font files). */
  theme?: (t: Theme) => void;
  /** Draw into the scene and return the figure height in pt. */
  draw: (s: Scene) => number;
};

export const defineFigure = (spec: FigureSpec) => spec;
export * from './scene';
export { line } from './measure';
export { MM, defaultTheme, type Theme } from './theme';
export * from './space';
