# 工具包说明

`assets/kit/` 中的文件复制到图的工程目录后可按需修改：

| 文件 | 作用 |
| --- | --- |
| `theme.ts` | 色调、字号、线宽、留白、测量用字体文件，单位均为 pt |
| `themes.ts` | 命名主题预设、`ramp()` 与 `applyTheme()` |
| `measure.ts` | 用 fontkit 测量文字、用 MathJax 测量公式（含高度与深度） |
| `scene.tsx` | 绘图原语；每个原语同时输出 SVG 并登记几何信息 |
| `audit.ts` | 基于登记的几何信息做审计，在 Node 中运行 |
| `cli.tsx` | `build` 与 `export` 命令 |
| `index.ts` | `defineFigure` 与导出入口 |

## figure.tsx

```tsx
export default defineFigure({
  name: 'overview',            // 导出文件名
  widthMM: 174,                // 最终印刷宽度
  title: '...', desc: '...',   // 写入 SVG 的 title/desc
  assets: { input: 'assets/input.png' },
  hashes: { input: '<sha256>' },         // 可选；不一致时构建中止
  theme: ['navy', t => { t.size.label = 7; }], // 可选；预设名、调整函数或二者的列表，见“主题”
  draw(s) { /* 绘制 */ return heightPt; } // 返回图高
});
```

图高由内容决定：`draw` 末尾返回最后一个对象的下边缘。

## 文字与公式

字符串中 `$...$` 为行内 TeX，`*...*` 为斜体。`s.line(text, { size, bold, color })` 返回已测量的行，可传给任何接受文字的原语。TeX 内可用 `\color{#hex}{...}` 给单个符号着色。

`s.label(id, text, { x, y, ax, ay, ... })` 放置一行。`ax` 为 `l`/`c`/`r`；`ay` 的取值：

- `base`：基线在 y
- `mid`：大写字高的中点在 y（与模块、图块的中心对齐时使用）
- `top`：大写字高顶部在 y（标题、说明文字）
- `inkTop` / `inkBottom`：真实墨迹边缘在 y（紧贴连线上方或对象下方时使用）

`s.caption(id, [行1, 行2], { x, y })` 在对象下方放置居中的多行说明，返回整体的盒子。

## 对象

- `s.node(id, { lines, tone, x|cx, y|cy, w, h, minW, minH, group })`：圆角模块。未给 `w`/`h` 时按内容与留白自动确定。同一 `group` 的模块须等高。
- `s.measureNode(spec)`：只测量不绘制，用于先算布局。
- `s.tile(id, asset, { x, y, size, h, tone, frame })`：图像块，作为独立的 `<image>` 嵌入；`h` 省略时为正方形，`frame: 0` 不画边框。
- `s.op(id, kind, { cx, cy, r })`：圆形运算符。`kind` 为 `'add'`、`'sub'`、`'mul'`、`'concat'`，或自定义符号：`{ path, tone }`（单位圆坐标系中的描边路径，例如激活函数的波形）、`{ text }`（短文字或 TeX）。
- `s.badge(id, 'snowflake'|'flame', { cx, cy, tone, inside })`：放在模块角上的图标徽标；`s.icon` 为不带底的图标（图例使用）。
- `s.region(id, box, { tone })`：虚线分组区域，位于最底层，连线可穿过。
- `s.rule(from, to)`：分隔细线。`s.dot(pt)`：分支点。
- `s.raw(id, jsx, box, { inside })`：自定义图形；必须给出包围盒，审计才能看到它。

所有原语返回盒子 `{x, y, w, h}`。辅助函数：`cx` `cy` `right` `bottom`、`port(box, side, at, out)`、`spread(widths, x0, x1)`（等间距排布）、`union(...boxes)`、`grow(box, d)`、`mid(p, q, t)`、`mix(colorA, colorB, t)`。

## 模块图用到的原语

- **竖排薄层**：`s.node(id, { lines, vertical: true, x, cy, w, h })`，文字自下而上阅读。相邻的层共用一条边即可贴合成组（后一个的 `x` 取前一个的 `right`）。单独的竖排文字用 `s.label(id, text, { x, y, rotate: true })`，`x, y` 为文字中心。
- **面板**：`s.panel(id, box, { title, tone, at, fill, dash })`。带标题的容器，位于底层，连线和内容都画在它上面；底色默认比同色调的节点浅一级。`at` 为 `tl`（默认）、`tr`、`tc` 或 `below`。面板的盒子先用常量定好，内容按面板的原点定位。
- **放大引线**：`s.zoom(id, fromBox, toBox, { tone })`。从小块到面板的淡色梯形，自动选择两者相对的边。它在底层按调用顺序叠放：先画引线要盖住的面板，再画引线，最后画目标面板。不参与审计。
- **直连**：`s.link(a, b, opts)`。两个对象正对时（横向或纵向投影有重叠）画一条直线箭头并自动登记起止；不正对时报错，改用 `wire` 写明折点。
- **跨越**：`s.wire(id, pts, { hop: ['其他连线 id'] })`。在与所列连线的交点处画小弧；被跨越的线须先画。
- **图例**：`s.legend(id, entries, { x, y, ax, dir, gap, rowGap })`。条目为 `{ op }`、`{ swatch: 色调 }`、`{ wire: { tone, dash } }` 或 `{ icon }`，各带 `text`；`dir: 'column'` 竖排。
- **自定义小图形**：总览里块内的色条等用 `s.raw(id, jsx, box, { inside: 父对象 id })`，声明所属对象后不会被判为重叠。

## 三维场景（Space）

`kit/space.tsx` 提供正交投影的三维场景，输出为普通 SVG 路径，用于机理图中的曲面、空间轨迹和堆叠平面。设计规则见 [mechanism-figures.md](mechanism-figures.md)。

| 接口 | 作用 |
| --- | --- |
| `new Space({ box, azimuth, elevation, scale, centre?, light? })` | 相机方位角与仰角（度），z 轴向上；`scale` 为每世界单位的 pt；`centre` 对应 `box` 的中心 |
| `at(p)` | 世界坐标到页面坐标（pt），用于放置标签和连线 |
| `surface(f, { u, v, n, dark, light, grid?, edge?, opacity? })` | 参数曲面，拆为按法向着色的四边形；`grid` 画等参线，`edge` 画边界 |
| `curve(points, { color, width, opacity, dash, arrow, bias })` | 折线，逐段参与深度排序 |
| `dot(p, {...})`、`polygon(points, {...})` | 点与平面多边形 |
| `render()` | 按由远及近的顺序输出，交给 `s.raw(id, sp.render(), box, { kind: 'region' })` |
| `seeded(seed)`、`gaussian(rand)` | 固定种子的均匀与正态随机数，供随机路径使用 |

`Space` 内部的图元不参与几何审计；标签一律用 `s.label` 绘制。

## 连线

`s.wire(id, points, { from, to, tone, dash, arrow, cross, hop, width, color })`。折线经过给定点，转角自动取圆角；箭头为显式路径，线段在箭头内收尾。`from`/`to` 写起止对象的 id；从标签或线上某点出发时省略对应一端。`cross` 列出有意穿过或交叉的对象与连线。

在预留通道内转折：先算出通道的坐标（例如说明文字下边缘加固定间距），再让相关连线和节点都引用这个值。

## 构建与导出

```sh
npm run build     # SVG + audit.json + preview.html
npm run watch     # 保存后自动重建
npm run export    # 另生成 PDF、PNG、pdf-check.png、export-report.json
npm run typecheck
```

`cli.tsx` 接受 `--figure <文件>`、`--out <目录>`、`--theme <预设>`、`--dpi <n>`、`--allow-errors`。

`preview.html` 可离线打开，提供适应窗口、印刷尺寸、300%、审计框四种视图；审计框视图显示每个对象登记的包围盒，有问题的标红。屏幕上的“印刷尺寸”依赖显示器设置，物理尺寸以 PDF 为准。

导出细节：

- SVG 只使用 `text`、`path`、`rect`、`circle`、`image` 与 `g`，不含嵌套 `svg`、`marker`、`foreignObject` 或外部引用，便于 Illustrator、Inkscape 和其他渲染器打开。文字保持为可编辑文本，公式为矢量路径并在 `data-tex` 中保留源码。
- PDF 由 Chrome 打印。Chrome 会把页面尺寸取整到 1/300 英寸，因此先打印到略大的页面，再用 pdf-lib 把页面框设为精确尺寸。
- PNG 由同一浏览器按 `--dpi`（默认 600）渲染。
- Chrome 路径可用环境变量 `CHROME_PATH` 指定。系统装有 poppler 时会额外报告字体嵌入与图片对象数，并输出 PDF 的栅格检查图。

`export-report.json` 中 `text.worstWidthDriftPt` 是浏览器实际渲染宽度与 fontkit 测量值的最大差距。超过 0.5 pt 说明测量用字体与渲染字体不一致：检查 `theme.fontFiles` 是否指向 `theme.fontFamily` 中排在首位且系统已安装的字体。

## 主题

主题只改变颜色、字体与线条处理，不改变构图。七个色调名（`neutral`、`grey`、`blue`、`green`、`orange`、`purple`、`red`）是语义槽位，每个预设都会填满，因此同一份源码可以直接切换主题。

| 预设 | 用途 |
| --- | --- |
| `pastel` | 默认。低饱和色相配浅色填充，Times，柔和圆角 |
| `navy` | 以藏青为主的 NPG 色相，无衬线字体（Arial），5–7 pt 字号，细线；适合字号与线宽要求较小的版面 |
| `slate` | 深灰中性色为底，蓝色为唯一强调色，其余色调降低饱和度，近直角；适合机理图 |
| `terracotta` | 青绿与赭红强调色，配暖色浅底 |
| `okabe-ito` | Okabe–Ito 配色，在常见色觉缺陷下仍可区分 |
| `mono` | 灰度，用于检查黑白印刷下各色调能否区分 |

选择方式有三种：

```ts
theme: 'navy',                                  // 使用预设
theme: ['navy', t => { t.size.label = 6.5; }],  // 预设后再做调整，按顺序执行
```

命令行 `--theme <预设>` 替换图中写定的预设，保留其中的调整函数，用于不改源码比较各主题，例如 `npm run build -- --theme mono`。未知的预设名会报错并列出可用名称。

自定义配色时，用 `ramp(base, { fill, text })` 由一个基色生成一个色调：`stroke` 与 `line` 取基色，`fill` 为基色与白色按 `fill`（默认 0.88）混合，`text` 为基色向黑色加深 `text`（默认 0.32）。

```ts
import { defineFigure, ramp } from './kit';
theme: ['navy', t => { t.tones.blue = ramp('#2E6DB4'); t.tones.orange = ramp('#C8702A', { fill: 0.85 }); }],
```

图中的颜色应取自色调（`s.tone('blue').line`）或主题字段（`s.theme.ink`、`muted`、`hairline`、`paper`），不写固定的十六进制色值，否则切换主题时这些颜色不会随之改变。需要中间色时用 `mix()` 由主题颜色混合得到。

## 换字体、中文与多语言

`theme.fontFiles` 为每种字形列出候选文件，取第一个存在的文件用于测量；`theme.fontFamily` 是写入 SVG 的字体栈。两者需指向同一字体，且该字体须已安装在系统中，浏览器才能渲染。默认是 Times New Roman（macOS 路径）及其在 Linux 上的替代。

图中文字的字体应与稿件一致。用 `pdffonts` 查看稿件 PDF 实际嵌入的字体，不凭模板名称推断（例如 XeLaTeX 下 `times` 宏包不生效，西文实际是 Latin Modern）。

含中文时，在 `theme.fallbackFonts` 中列出中文字体；测量会像浏览器一样逐字回退，西文走主字体，中文走回退字体。字体集合文件写作 `文件.ttc#PostScript名`：

```ts
theme: t => {
  t.fontFamily = '"Latin Modern Roman", "Songti SC", serif';
  t.fontFiles = { regular: [lmRegular], bold: [lmBold], italic: [lmItalic] };
  t.fallbackFonts = { regular: [songti + '#STSongti-SC-Regular'], bold: [songti + '#STSongti-SC-Bold'] };
}
```

含中文的行按汉字字面中心做垂直居中。多语言版本共用一份绘图代码：把字符串放进按语言索引的表，用 `--figure figure.zh.tsx --out exports/zh` 分别构建；因为位置都由测量推导，换语言后版面自动重排，再跑一次审计即可。

## 论文版面校样

把导出的 PDF 以正文中的文件名链接进稿件的独立副本后编译，查看图所在页面与总页数变化；不改动原稿目录。稿件使用私有 TeX 树或 latexmkrc 时，沿用其环境变量。
