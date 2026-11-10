---
name: pt-perfect
description: Build publication-quality paper figures (method/framework diagrams, module/architecture breakdowns, mechanism/motivation figures with vector 3D scenes) with a measure-first React + SVG kit, a geometry audit, and size-exact PDF/SVG/PNG export. 用 React + SVG 与随附工具包制作论文方法图、框架图、模块图（网络结构逐层展开）、主视觉图和机理图（阐述动机与核心创新点，含矢量三维场景），交付可维护源码及尺寸精确的 PDF/SVG/PNG。适用于含真实图像、公式、连线、需按印刷尺寸核对的科研插图；不用于定量统计图、网页界面或视频。
---

# pt-perfect

论文图的质量取决于两件事：图是否讲清一个论点，以及每个元素的位置是否由内容推导而来。本技能随附一个小工具包（`assets/kit/`），负责第二件事——先测量文字和公式，再定尺寸、定位置、连线、审计、导出——使精力可以放在第一件事上。

手写绝对坐标是这类图反复出问题的根源：公式的上下标把模块撑破、标签居中不一致、移动一个节点后连线穿过文字。工具包从结构上避免这些问题，而不是事后逐个修补。

## 工作流程

1. **读原文，写 brief。** 从正文、公式、算法和已有图整理：读者应记住的一句话、图中对象及其关系、哪些只在训练或推理出现、目标宽度（从模板读取，例如双栏跨栏 174 mm）。上下文足够时直接进行。
2. **定构图。** 读 [references/composition.md](references/composition.md)，先决定主干和层级，再动手。画网络结构、模块内部或“展开某个块”的图时，另读 [references/module-figures.md](references/module-figures.md)：这类图从代码的 `forward` 出发，按总览、阶段、算子三层展开。画阐述动机或核心创新点的原理图时，另读 [references/mechanism-figures.md](references/mechanism-figures.md)：先把论断写成一句话，再用同一场景的多个面板做对照，并区分按比例的量与示意的量。
3. **建工程。** 新方案放独立目录，不覆盖已有图：
   ```sh
   cp -R <skill>/assets/template/. <figure-dir>/ && cp -R <skill>/assets/kit <figure-dir>/kit
   cd <figure-dir> && npm install
   ```
   构图写在 `figure.tsx`，它是唯一的编辑源。API 见 [references/toolkit.md](references/toolkit.md)。`assets/examples/vit-module.tsx` 是一张模块图，`assets/examples/context-mechanism.tsx` 是一张使用矢量三维场景（`Space`）的机理图，可作写法参考。
4. **构建并审计。** `npm run build` 生成 SVG、`exports/audit.json` 与 `exports/preview.html`，不需要浏览器。审计报错即修改构图，不靠放宽规则通过。
5. **看图。** 审计只能证明没有机械缺陷。导出后查看整图和局部放大，再放进论文版面按实际尺寸查看；对照 composition.md 末尾的自查问题修改。至少迭代一轮。
6. **导出并核对。** `npm run export` 生成 PDF 与 PNG，并写出 `exports/export-report.json`（页面尺寸、字体嵌入、图片对象数、文字实测宽度与预测宽度之差）。
7. **交付。** 工程路径、导出文件、素材来源记录、实际验证结果。不自动替换正文中的图，不修改正文。

## 关键约定

- **单位即印刷磅值。** 画布宽度等于最终印刷宽度，viewBox 以 pt 为单位，所以 `size: 7.5` 就是纸面上的 7.5 pt，`0.7` 就是 0.7 pt 线宽。不需要换算，也不存在“放进论文后字太小”的意外。
- **先测量，后定位。** `measureNode` 给出内容所需尺寸；位置由相邻对象的盒子算出（`right(a) + gap`、`cx(tile)`），不写凭目测得到的数字。需要多个模块等高时，先测量全部再取最大值。
- **按视觉中心对齐，按墨迹留白。** 文字与公式共用一条基线，垂直居中以大写字高为准；模块尺寸与碰撞检查使用含上下标的真实墨迹范围。这是公式不出框、标签不错位的原因。
- **连线从端口出发并声明起止对象。** `wire(id, [port(a,'right'), port(b,'left')], { from, to })`。审计据此核对端点落在边框上、未穿过其他对象。
- **真实素材原样嵌入。** 图片按字节嵌入并可校验 sha256；派生图像在来源记录中写明公式、参数、显示变换。概念示意不得冒充实验结果。
- **主题按用户偏好选择。** 先询问用户偏好的配色与字体（衬线或无衬线），据此选用 `navy`、`slate` 等预设；未说明时使用默认的 `pastel`。颜色一律取自色调或 `s.theme`，以便整体切换，见 [references/toolkit.md](references/toolkit.md) 的“主题”一节。
- **公式保留 TeX 源。** 行内写 `'Anchor $a = f(y)$'`，由 MathJax 转为矢量路径；符号需与正文逐一核对。

## 素材与来源

真实实验图直接使用原始文件；裁块记录原图与坐标。数值标注从数据文件读取并注明出处，不手抄。用户要求用生图模型探索构图时，生成图只作构图参考。已有 Figma/PPT/旧图作为历史参考保留。

## 审计覆盖范围

越界、标签相互重叠或过近、标签压在不属于它的对象上、内容超出模块、对象重叠、连线端点未落在边框、连线穿过标签或对象、连线重合或未声明的交叉、箭头末段过短、字号低于下限、同组模块不等高、标签骑在面板边框上、同一容器内边缘或中心相差不足 0.7 pt 的“近似对齐”。导出阶段另查：PDF 页面尺寸与单页、字体嵌入、图片对象、浏览器实际文字宽度与测量值的偏差。

审计不覆盖：科学内容是否正确、阅读顺序是否自然、是否美观，以及放大引线（`zoom`）是否压到文字。这些必须看图判断。
