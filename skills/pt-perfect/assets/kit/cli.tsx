// tsx kit/cli.tsx build    -> exports/<name>.svg, audit.json, preview.html (no browser)
// tsx kit/cli.tsx export   -> build, then PDF + PNG through Chrome and export-report.json
// Options: --figure <file> (default figure.tsx), --out <dir> (default exports), --dpi <n> (default 600), --allow-errors
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { Scene } from './scene';
import { audit, type Finding } from './audit';
import { initFonts, fontReport } from './measure';
import { defaultTheme, MM } from './theme';
import type { FigureSpec } from './index';

const args = process.argv.slice(2);
const command = args[0] ?? 'build';
const flag = (name: string, fallback?: string) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const figureFile = path.resolve(flag('figure', 'figure.tsx')!);
const root = path.dirname(figureFile);
const out = path.resolve(root, flag('out', 'exports')!);
const dpi = Number(flag('dpi', '600'));
const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function build() {
  const spec: FigureSpec = (await import(pathToFileURL(figureFile).href)).default;
  const theme = structuredClone(defaultTheme);
  spec.theme?.(theme);
  initFonts(theme);
  const assets: Record<string, string> = {}, hashes: Record<string, string> = {};
  for (const [name, file] of Object.entries(spec.assets ?? {})) {
    const bytes = fs.readFileSync(path.resolve(root, file));
    hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
    if (spec.hashes && spec.hashes[name] !== hashes[name]) throw new Error(`Asset "${name}" (${file}) does not match its recorded sha256`);
    assets[name] = `data:${mime[path.extname(file).toLowerCase()] ?? 'application/octet-stream'};base64,${bytes.toString('base64')}`;
  }
  const scene = new Scene(spec.widthMM * MM, theme, assets);
  scene.height = spec.draw(scene);
  if (!(scene.height > 0)) throw new Error('draw() must return the figure height in pt');
  const result = audit(scene);
  const svg = renderToStaticMarkup(scene.render(spec));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${spec.name}.svg`), svg);
  const sizeMM = { width: +(scene.width / MM).toFixed(3), height: +(scene.height / MM).toFixed(3) };
  const report = {
    figure: spec.name, sizeMM, sizePt: { width: +scene.width.toFixed(3), height: +scene.height.toFixed(3) },
    measuredWith: fontReport, assetSha256: hashes, hashesChecked: Boolean(spec.hashes), stats: result.stats,
    errors: result.findings.filter(x => x.level === 'error'), warnings: result.findings.filter(x => x.level === 'warn'),
  };
  fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'preview.html'), preview(spec, scene, svg, result.findings));
  console.log(`${spec.name}: ${sizeMM.width} x ${sizeMM.height} mm, ${result.stats.labels} labels (${result.stats.minLabelPt}-${result.stats.maxLabelPt} pt), ${result.stats.images} images, ${result.stats.wires} wires`);
  for (const x of result.findings) console.log(`  ${x.level === 'error' ? 'ERROR' : 'warn '} ${x.rule}: ${x.ids.join(' / ')} - ${x.detail}`);
  if (!result.findings.length) console.log('  audit clean');
  return { spec, scene, svg, report };
}

function preview(spec: FigureSpec, scene: Scene, svg: string, findings: Finding[]) {
  const flagged = new Set(findings.flatMap(x => x.ids));
  const colour: Record<string, string> = { label: '#2F6FAE', image: '#4C8C82', node: '#B9793E', op: '#B9793E', raw: '#8B98A4', region: '#8B98A4' };
  const boxes = scene.items.map(i => `<rect x="${i.box.x.toFixed(2)}" y="${i.box.y.toFixed(2)}" width="${i.box.w.toFixed(2)}" height="${i.box.h.toFixed(2)}" fill="${flagged.has(i.id) ? '#D0303033' : 'none'}" stroke="${flagged.has(i.id) ? '#D03030' : colour[i.kind]}" stroke-width="0.25"><title>${esc(i.id)}</title></rect>`).join('');
  const wires = scene.wires.map(w => `<polyline points="${w.pts.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${flagged.has(w.id) ? '#D03030' : '#7C5FB2'}" stroke-width="0.25" stroke-dasharray="1 1"><title>${esc(w.id)}</title></polyline>`).join('');
  const W = scene.width.toFixed(2), H = scene.height.toFixed(2);
  const list = findings.length ? findings.map(x => `<li class="${x.level}"><b>${x.rule}</b> ${esc(x.ids.join(' / '))} - ${esc(x.detail)}</li>`).join('') : '<li>audit clean</li>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(spec.name)} preview</title><style>
body{margin:0;padding:20px;background:#E9EDF0;font:13px system-ui,sans-serif;color:#2F3742}
header{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}header b{margin-right:auto}
button{padding:6px 12px;background:#fff;border:1px solid #AAB5C0;border-radius:4px;cursor:pointer}
#stage{position:relative;background:#fff;margin:auto;box-shadow:0 1px 4px #0002}#stage>svg{display:block;width:100%;height:auto}
#overlay{position:absolute;inset:0;display:none}#stage.debug #overlay{display:block}
ul{max-width:1100px;margin:16px auto;padding-left:18px;line-height:1.5}li.error{color:#B03030}li.warn{color:#8A5528}
@media print{body{padding:0;background:#fff}header,ul{display:none}#stage{box-shadow:none;width:${W}pt!important}#overlay{display:none!important}}
</style></head><body><header><b>${esc(spec.name)} - ${(scene.width / MM).toFixed(1)} x ${(scene.height / MM).toFixed(1)} mm</b>
<button onclick="stage.style.width='100%'">Fit window</button><button onclick="stage.style.width='${W}pt'">Print size</button><button onclick="stage.style.width='${(scene.width * 3).toFixed(0)}pt'">300%</button><button onclick="stage.classList.toggle('debug')">Audit boxes</button></header>
<div id="stage" style="width:100%">${svg}<svg id="overlay" viewBox="0 0 ${W} ${H}">${boxes}${wires}</svg></div><ul>${list}</ul></body></html>`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function tool(name: string, argv: string[]): string | null {
  try { return execFileSync(name, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; }
}

async function exportAll() {
  const { spec, scene, svg, report } = await build();
  if (report.errors.length && !args.includes('--allow-errors')) { console.error('Export stopped: fix audit errors first (or pass --allow-errors).'); process.exit(2); }
  const { chromium } = await import('playwright-core');
  const { PDFDocument } = await import('pdf-lib');
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
  const executablePath = candidates.find(c => fs.existsSync(c));
  const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { headless: true });
  const W = scene.width, H = scene.height;
  const pdfPath = path.join(out, `${spec.name}.pdf`), pngPath = path.join(out, `${spec.name}.png`);
  const exportReport: Record<string, unknown> = { browser: executablePath ?? 'playwright chromium' };
  try {
    // Vector PDF. Chrome snaps the page box to 1/300 in, so print on a slightly
    // larger page and then set the page boxes to the exact figure size.
    const slack = 6, page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}svg{display:block;width:${W}pt;height:${H}pt}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => (document as any).fonts.ready);
    const family = scene.theme.fontFamily.split(',')[0].trim();
    const check = await page.evaluate((fam: string) => {
      const d = document as any;
      const drift = [...d.querySelectorAll('#labels [data-id][data-w]')].map((g: any) => {
        const texts = [...g.querySelectorAll('text')];
        return texts.length === 1 && g.children.length === 1 ? { id: g.getAttribute('data-id'), measured: +g.getAttribute('data-w'), rendered: texts[0].getComputedTextLength() } : null;
      }).filter(Boolean);
      return { fontAvailable: d.fonts.check(`12px ${fam}`), drift, images: [...d.images].length, brokenImages: [...d.querySelectorAll('image')].filter((i: any) => i.getBBox().width === 0).length };
    }, family);
    const drift = (check.drift as { id: string; measured: number; rendered: number }[]).map(x => ({ ...x, delta: +(x.rendered - x.measured).toFixed(3) }));
    const worst = drift.reduce((m, x) => Math.max(m, Math.abs(x.delta)), 0);
    exportReport.text = { family, availableInBrowser: check.fontAvailable, plainTextLabelsCompared: drift.length, worstWidthDriftPt: +worst.toFixed(3), over0_5pt: drift.filter(x => Math.abs(x.delta) > 0.5) };
    const raw = await page.pdf({ width: `${(W + slack) / 72}in`, height: `${(H + slack) / 72}in`, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' }, pageRanges: '1' });
    const pdf = await PDFDocument.load(raw);
    const p = pdf.getPage(0), ph = p.getHeight();
    for (const set of ['setMediaBox', 'setCropBox', 'setTrimBox', 'setBleedBox', 'setArtBox'] as const) p[set](0, ph - H, W, H);
    pdf.setTitle(spec.title); pdf.setProducer('pt-perfect kit');
    fs.writeFileSync(pdfPath, await pdf.save());
    await page.close();
    // Raster PNG from the same SVG and renderer.
    const pxW = Math.round(W / 72 * dpi), pxH = Math.round(H / 72 * dpi);
    const shot = await browser.newPage({ viewport: { width: pxW, height: pxH }, deviceScaleFactor: 1 });
    await shot.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}svg{display:block;width:${pxW}px;height:${pxH}px}</style></head><body>${svg}</body></html>`);
    await shot.evaluate(() => (document as any).fonts.ready);
    await shot.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: pxW, height: pxH } });
    await shot.close();
    exportReport.png = { width: pxW, height: pxH, dpi };
  } finally { await browser.close(); }
  // Inspect the PDF that was actually written.
  const doc = await PDFDocument.load(fs.readFileSync(pdfPath));
  const box = doc.getPage(0).getMediaBox();
  const pdfReport: Record<string, unknown> = { pages: doc.getPageCount(), widthMM: +(box.width / MM).toFixed(3), heightMM: +(box.height / MM).toFixed(3), expectedMM: report.sizeMM };
  const fonts = tool('pdffonts', [pdfPath]);
  if (fonts) { const rows = fonts.trim().split('\n').slice(2); pdfReport.fonts = rows.map(l => l.trim().split(/\s{2,}|\s(?=(?:yes|no)\s)/)[0]); pdfReport.allFontsEmbedded = rows.every(l => /\byes\b/.test(l.split(/\s+/).slice(-5).join(' '))); }
  const imgs = tool('pdfimages', ['-list', pdfPath]);
  if (imgs) pdfReport.imageObjects = imgs.trim().split('\n').slice(2).filter(l => /\bimage\b/.test(l)).length;
  if (tool('pdftoppm', ['-r', '200', '-png', '-singlefile', pdfPath, path.join(out, 'pdf-check')]) !== null) pdfReport.rasterCheck = 'pdf-check.png';
  exportReport.pdf = pdfReport;
  const sizeOk = Math.abs(box.width - W) < 0.01 && Math.abs(box.height - H) < 0.01 && doc.getPageCount() === 1;
  exportReport.ok = sizeOk && (exportReport.text as any).availableInBrowser && !(exportReport.text as any).over0_5pt.length;
  fs.writeFileSync(path.join(out, 'export-report.json'), JSON.stringify(exportReport, null, 2) + '\n');
  console.log(`PDF ${pdfReport.widthMM} x ${pdfReport.heightMM} mm, ${pdfReport.pages} page; PNG ${(exportReport.png as any).width} x ${(exportReport.png as any).height}; worst text drift ${(exportReport.text as any).worstWidthDriftPt} pt; ok=${exportReport.ok}`);
  if (!exportReport.ok) process.exitCode = 2;
}

if (command === 'build') { const { report } = await build(); if (report.errors.length) process.exitCode = 2; }
else if (command === 'export') await exportAll();
else { console.error('Usage: tsx kit/cli.tsx build|export [--figure file] [--dpi n] [--allow-errors]'); process.exit(1); }
