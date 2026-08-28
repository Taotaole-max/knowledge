#!/usr/bin/env node
/**
 * 把《深度学习500问》的 Markdown 源文件构建成完全离线的静态站点。
 *
 * 与原仓库的区别：数学公式在构建期由 KaTeX 渲染成 HTML，
 * 因此产物不加载任何 CDN 资源、不依赖运行时 JavaScript，
 * 断网、双击 index.html 直接打开都能正常显示公式。
 *
 * 用法: node tools/build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

const CHAPTERS = [
  { dir: 'ch01_数学基础', file: '第一章_数学基础.md', num: 1, title: '数学基础' },
  { dir: 'ch02_机器学习基础', file: '第二章_机器学习基础.md', num: 2, title: '机器学习基础' },
  { dir: 'ch03_深度学习基础', file: '第三章_深度学习基础.md', num: 3, title: '深度学习基础' },
  { dir: 'ch04_经典网络', file: '第四章_经典网络.md', num: 4, title: '经典网络' },
  { dir: 'ch05_卷积神经网络(CNN)', file: '第五章_卷积神经网络(CNN).md', num: 5, title: '卷积神经网络 (CNN)' },
  { dir: 'ch06_循环神经网络(RNN)', file: '第六章_循环神经网络(RNN).md', num: 6, title: '循环神经网络 (RNN)' },
  { dir: 'ch07_生成对抗网络(GAN)', file: 'ch7.md', num: 7, title: '生成对抗网络 (GAN)' },
  { dir: 'ch08_目标检测', file: '第八章_目标检测.md', num: 8, title: '目标检测' },
  { dir: 'ch09_图像分割', file: '第九章_图像分割.md', num: 9, title: '图像分割' },
  { dir: 'ch10_强化学习', file: '第十章_强化学习.md', num: 10, title: '强化学习' },
  { dir: 'ch11_迁移学习', file: '第十一章_迁移学习.md', num: 11, title: '迁移学习' },
  { dir: 'ch12_网络搭建及训练', file: '第十二章_网络搭建及训练.md', num: 12, title: '网络搭建及训练' },
  { dir: 'ch13_优化算法', file: '第十三章_优化算法.md', num: 13, title: '优化算法' },
  { dir: 'ch14_超参数调整', file: '第十四章_超参数调整.md', num: 14, title: '超参数调整' },
  { dir: 'ch15_GPU和框架选型', file: '第十五章_异构运算、GPU及框架选型.md', num: 15, title: '异构运算、GPU 及框架选型' },
  { dir: 'ch16_自然语言处理(NLP)', file: '第十六章_NLP.md', num: 16, title: '自然语言处理 (NLP)' },
  { dir: 'ch17_模型压缩、加速及移动端部署', file: '第十七章_模型压缩、加速及移动端部署.md', num: 17, title: '模型压缩、加速及移动端部署' },
  { dir: 'ch18_后端架构选型、离线及实时计算', file: '第十八章_后端架构选型、离线及实时计算.md', num: 18, title: '后端架构选型、离线及实时计算' },
  { dir: 'ch18_后端架构选型及应用场景', file: '第十八章_后端架构选型及应用场景.md', num: 18.5, title: '后端架构选型及应用场景' },
  { dir: 'ch19_软件专利申请及权利保护', file: '第十九章_软件专利申请及权利保护.md', num: 19, title: '软件专利申请及权利保护' },
];

// ---------------------------------------------------------------- markdown-it

const md = require('markdown-it')({ html: true, linkify: true, breaks: false });
md.use(require('@vscode/markdown-it-katex').default, {
  // 原文里有 $$向量的范数$$ 这类把中文写进公式的用法。KaTeX 能正常渲染，
  // 但 strict 模式会对每个汉字告警刷屏，所以关掉。
  strict: false,
  // 个别公式用了 KaTeX 不支持的宏，标红显示即可，不要中断整本书的构建。
  throwOnError: false,
  errorColor: '#c0392b',
});

// 宽表格在窄屏上横向滚动，而不是把整页撑开。
md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n';
md.renderer.rules.table_close = () => '</table>\n</div>\n';

// 图片懒加载，1100+ 张图时首屏快很多。
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

// ------------------------------------------------------------- 源文本规范化
//
// 原稿里有四类写法会让公式渲染失败，正是"满屏乱码"的来源。这里在解析前统一修正。

const katex = require('katex');

const fixes = { fence: 0, inline: 0, eqnarray: 0, subscript: 0, strayProse: 0, adjacent: 0, zwsp: 0, backtick: 0, flanking: 0, backtickForm: 0 };

// 占位符用 U+0001 包裹：正文里绝不会出现该控制符，因此不会像 "F1 值"、"C4.5"
// 那样被朴素记号误伤。还原时同样按此格式匹配。
const ph = (kind, i) => `\u0001${kind}${i}\u0001`;

/**
 * 把 `$$ ... $$` 统一改写成独占整行、前后留空行的块级公式。
 *
 * 原稿大量出现 `文字\n$$\n公式\n$$\n紧接着的文字` 和 `$$ 公式 \tag{1} $$` 这种
 * 写法。没有空行时 markdown 会把整段并成一个段落，`$$` 于是走行内规则、跟错误的
 * 定界符配对，把后面成片的中文一起吞进数学模式——渲染出来就是一团红色的乱码。
 */
/**
 * 对会被 markdown 自身语法改写的公式，改用 GitHub 的 `$` + 反引号写法。
 *
 * 三种情况会让公式在 GitHub 上失效，且都无法靠补空格解决：
 *   - `$S^{-1}_{w} S_b$` 与同行另一条公式的 `_` 配对成斜体
 *   - `$7*7*3$` 的 `*` 同理配对成斜体
 *   - 表格单元格里 `\\` 被表格解析器吃掉一个，矩阵换行失效
 *
 * 判据不靠人工枚举：把该行按普通 markdown 渲染一遍，若公式原文没能原样保留，
 * 就说明 markdown 语法动了它。这类公式改写成 $`...`$ ——这是 GitHub 官方
 * 文档给出的写法，实测三类问题都能修好（其余候选写法均无效）。
 *
 * 只对确实脆弱的那少数几条这么做：该写法是 GitHub 专有的，
 * 其他编辑器不认，因此不宜全书铺开。
 */
const mdPlain = require('markdown-it')({ html: true });

const decodeEntities = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

function toBacktickWhenFragile(text) {
  return text.split('\n').map((line) => {
    if (!line.includes('$')) return line;
    const rendered = decodeEntities(mdPlain.renderInline(line));
    return line.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (m, body) => {
      if (rendered.includes(m)) return m; // markdown 没动它，保持通用写法
      fixes.backtickForm++;
      return '$`' + body + '`$';
    });
  }).join('\n');
}

/** 读回上一次构建写下的 $`...`$，还原成普通写法后再走一遍流水线（保证幂等）。 */
function unwrapGithubMath(text) {
  return text.replace(/\$`([^`\n]+?)`\$/g, (m, body) => '$' + body + '$');
}

/**
 * 保证行内公式的起始 `$` 前面是空白或行首，否则 GitHub 不当它是公式定界符。
 *
 * 这条规则是从 GitHub 实际渲染结果反推出来的，不是照搬 CommonMark：抓取本仓库
 * 已发布页面统计，渲染成功的 81 条行内公式里，起始 `$` 前面 79 条是空白、2 条是
 * 段落起始，**没有一条**是汉字或标点；而失败的 164 条里，137 条前面是汉字、
 * 25 条前面是标点。可见 GitHub 比 CommonMark 的 flanking 规则更严——前面是标点
 * 同样不行。收尾的 `$` 则很宽松，后面接汉字、标点、空白都能正常渲染。
 *
 * 因此起始侧按需补空格是必须的；收尾侧只在后面紧跟汉字或字母时补，
 * 以免出现 `$x$ ，` 这种标点前空格。
 */
const isCJK = (c) => c >= '一' && c <= '鿿';

function padInlineMathForGitHub(text) {
  return text.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (m, body, offset) => {
    const inner = body.trim();
    if (!inner) return m;

    const prev = offset > 0 ? text[offset - 1] : '';
    const next = text[offset + m.length] || '';

    // 起始侧：GitHub 要求空白或行首，二者都不是就补一个空格。
    const needLeft = !(prev === '' || prev === '\n' || /\s/.test(prev));
    // 收尾侧：仅为排版补空格，标点前不补。
    const needRight = isCJK(next) || /[0-9A-Za-z]/.test(next);

    if (needLeft || needRight || inner !== body) fixes.flanking++;
    return (needLeft ? ' ' : '') + '$' + inner + '$' + (needRight ? ' ' : '');
  });
}

/**
 * 解开被反引号包住的公式。个别地方写成 `` `$U,W,b$` ``，会渲染成等宽代码
 * 而不是公式，读起来同样是一串裸 LaTeX。仅当反引号内容整体就是一条公式时才解开，
 * 真正想展示 $ 符号的代码片段不受影响。
 */
function unwrapBacktickMath(text) {
  return text.replace(/`\s*(\$[^`\n]+\$)\s*`/g, (m, math) => {
    fixes.backtick++;
    return math;
  });
}

/**
 * 清掉公式内部的零宽空格 (U+200B)。
 *
 * 原稿是从某个编辑器导出的，行内公式普遍写成 `$\mu<U+200B>$`。KaTeX 会把它当成
 * 一个没有字形的字符照常渲染，但 GitHub 自带的数学渲染器把闭合 `$` 前的零宽空格
 * 视作空白，于是该定界符不闭合、跟后面的 `$` 错误配对，整段 LaTeX 就裸露成源码。
 * 这正是在 GitHub 上直接看 .md 时仍然"乱码"的原因。
 */
function stripZwspInMath(text) {
  return text.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (m, body) => {
    if (!body.includes('\u200b')) return m;
    fixes.zwsp += (body.match(/\u200b/g) || []).length;
    return '$' + body.replace(/\u200b/g, '') + '$';
  });
}

/**
 * 拆开"紧挨着的两个行内公式"。原稿里有 `$C_2=8$$(满足C_1>C_2)$` 这种写法，
 * 前一个公式的结束符和后一个的起始符黏在一起，看上去像块级定界符。
 * 补一个空格，两条公式就都能正常渲染。
 */
function splitAdjacentInline(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '$' && text[i - 1] !== '\\' && !isDisplayDelim(text, i)) {
      out += '$ $';
      fixes.adjacent++;
      i++;
      continue;
    }
    out += text[i];
  }
  return out;
}

function normalizeDisplayMath(text, store) {
  const positions = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== '$' || text[i + 1] !== '$' || text[i - 1] === '\\') continue;
    if (isDisplayDelim(text, i)) positions.push(i);
    i++; // 跳过第二个 $
  }
  // 落单的 $$ 说明原稿另有问题，此时保持原样比猜测更安全。
  if (positions.length % 2) return text;

  let out = '';
  let cursor = 0;
  for (let p = 0; p < positions.length; p += 2) {
    const open = positions[p];
    const close = positions[p + 1];
    out += text.slice(cursor, open);

    const raw = text.slice(open + 2, close);
    fixes.zwsp += (raw.match(/\u200b/g) || []).length;
    const { math, tail } = repairBlock(raw.replace(/\u200b/g, ''));
    out += `\n\n${ph('D', store.push(math) - 1)}\n\n`;
    // 被误写进公式块里的正文，原样放回块后面当普通段落。
    if (tail.length) out += tail.join('\n').trim() + '\n\n';
    cursor = close + 2;
    fixes.fence++;
  }
  return out + text.slice(cursor);
}

/**
 * 判断某处的 `$$` 是不是真的块级定界符。
 *
 * 关键的反例是 `当$x=0$$f'(x)=0.25$` —— 前一个行内公式的结束符和后一个的起始符
 * 紧挨着，凑出一个假的 `$$`。真正的块级定界符总是贴着行首或行尾，据此区分。
 */
function isDisplayDelim(text, i) {
  let a = i - 1;
  while (a >= 0 && text[a] !== '\n' && /[ \t]/.test(text[a])) a--;
  if (a < 0 || text[a] === '\n') return true;

  let b = i + 2;
  while (b < text.length && text[b] !== '\n' && /[ \t]/.test(text[b])) b++;
  return b >= text.length || text[b] === '\n';
}

/**
 * 少数公式块里混进了正文（上游把说明文字写在了 $$ 里面，块外还有一份正确的重复）。
 * 从块尾逐行往外剥，直到剩下的部分能被 KaTeX 解析。
 */
function repairBlock(raw) {
  const lines = raw.split('\n');
  const tail = [];
  while (lines.length) {
    const candidate = lines.join('\n').trim();
    if (!candidate) break;
    try {
      katex.renderToString(candidate, { displayMode: true, strict: false, throwOnError: true });
      if (tail.length) fixes.strayProse++;
      return { math: candidate, tail };
    } catch (e) {
      tail.unshift(lines.pop());
    }
  }
  return { math: raw.trim(), tail: [] }; // 修不了就交给 KaTeX 标红，至少是可见的
}

/**
 * 合并被换行截断的行内公式。`$` 的行内规则不跨行，原稿里
 * `...使用$\nL(Y, f(x))$来表示` 这类断行会让整段 LaTeX 以源码形式裸露出来。
 */
function joinBrokenInlineMath(text) {
  // 一行里"落单"的 $ 个数：先去掉行内代码和已成对的公式，剩下的就是没闭合的。
  const orphans = (l) => {
    let t = l.replace(/`[^`\n]*`/g, '');
    t = t.replace(/(?<!\\)\$\$/g, '');
    t = t.replace(/(?<!\\)\$[^$\n]+?(?<!\\)\$/g, '');
    return (t.match(/(?<!\\)\$/g) || []).length;
  };
  // 合并后每条公式都必须能被 KaTeX 解析，否则说明这两个 $ 本来就不是一对。
  const mathOk = (s) => {
    for (const m of s.matchAll(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g)) {
      try {
        katex.renderToString(m[1], { strict: false, throwOnError: true });
      } catch (e) {
        return false;
      }
    }
    return true;
  };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (orphans(lines[i]) !== 1) continue;
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      if (lines[j].trim() === '') break; // 空行是段落边界，不跨越
      if (orphans(lines[j]) !== 1) continue;

      const merged = lines
        .slice(i, j + 1)
        .map((l, k) => (k === 0 ? l.replace(/\s+$/, '') : l.trim()))
        .join(' ');
      // 校验这道门把 shell 里的 `echo $NDK_ROOT` 之类挡在外面。
      if (orphans(merged) === 0 && mathOk(merged)) {
        lines.splice(i, j - i + 1, merged);
        fixes.inline++;
      }
      break;
    }
  }
  return lines.join('\n');
}

/** KaTeX 不支持 eqnarray；它的三列 `&=&` 对齐等价于 aligned 的 `&=`。 */
function eqnarrayToAligned(text) {
  return text.replace(/\\begin\{eqnarray\*?\}([\s\S]*?)\\end\{eqnarray\*?\}/g, (m, body) => {
    fixes.eqnarray++;
    return '\\begin{aligned}' + body.replace(/&\s*([^&\n]{0,12}?)\s*&/g, '&$1') + '\\end{aligned}';
  });
}

/** `_\boldsymbol w` 缺花括号，KaTeX 比多数 LaTeX 实现严格，会直接报错。 */
function braceSubscripts(text) {
  return text.replace(/([_^])\\(boldsymbol|mathbf|vec|mathrm)\s+(\w)/g, (m, op, cmd, arg) => {
    fixes.subscript++;
    return `${op}{\\${cmd} ${arg}}`;
  });
}

/** 依次施加以上修正，同时保证代码块内的内容原样不动。 */
function normalize(src) {
  const fences = [];
  const codes = [];
  const display = [];

  // 代码块与行内代码先挪走，公式修正绝不能碰它们（例如 shell 里的 $NDK_ROOT）。
  // 先解开反引号里的公式，否则它们会被当成行内代码保护起来。
  let text = unwrapBacktickMath(unwrapGithubMath(src))
    .replace(/^```[\s\S]*?^```/gm, (m) => `F${fences.push(m) - 1}`)
    .replace(/`[^`\n]*`/g, (m) => `C${codes.push(m) - 1}`);

  text = eqnarrayToAligned(text);
  text = braceSubscripts(text);
  text = stripZwspInMath(text);
  text = splitAdjacentInline(text);
  text = normalizeDisplayMath(text, display);
  text = joinBrokenInlineMath(text);
  text = stripZwspInMath(text);
  text = padInlineMathForGitHub(text);
  text = toBacktickWhenFragile(text);

  // 补空行的动作会叠加，这里折叠成最多一个空行，保证反复构建的结果稳定。
  // 代码块此时仍是占位符，块内的空行不受影响。
  text = text.replace(/\n{3,}/g, '\n\n');

  return text
    .replace(/D(\d+)/g, (m, i) => `$$\n${display[+i]}\n$$`)
    .replace(/C(\d+)/g, (m, i) => codes[+i])
    .replace(/F(\d+)/g, (m, i) => fences[+i]);
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 渲染一章，同时抽出 h2/h3 作为页内目录。 */
function renderChapter(src) {
  // [TOC] 是给旧编辑器用的占位符，静态站点自己生成目录。
  src = normalize(src.replace(/^\s*\[TOC\]\s*$/gim, ''));
  const normalized = src;

  // KaTeX 插件不认 $`...`$，渲染前先还原成普通写法。
  const forHtml = unwrapGithubMath(src);
  const env = {};
  const tokens = md.parse(forHtml, env);
  const toc = [];
  let n = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const level = Number(t.tag.slice(1));
    const text = tokens[i + 1] && tokens[i + 1].type === 'inline'
      ? tokens[i + 1].content.replace(/\$[^$]*\$/g, '').trim()
      : '';
    const id = `sec-${++n}`;
    t.attrSet('id', id);
    if (level === 2 || level === 3) toc.push({ id, level, text });
  }

  return { html: md.renderer.render(tokens, md.options, env), toc, normalized };
}

// ------------------------------------------------------------------ templates

/** depth = 页面相对仓库根的层数（根页面 0，章节页 1）。 */
function layout({ title, depth, navHtml, tocHtml, bodyHtml, prev, next }) {
  const up = depth === 0 ? '' : '../';
  const pager = (prev || next) ? `
    <nav class="pager">
      ${prev ? `<a class="pager-prev" href="${up}${encodeURI(prev.dir)}/">← 第 ${prev.num} 章 ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="pager-next" href="${up}${encodeURI(next.dir)}/">第 ${next.num} 章 ${esc(next.title)} →</a>` : '<span></span>'}
    </nav>` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · 深度学习500问</title>
<link rel="stylesheet" href="${up}assets/katex.min.css">
<link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
<input type="checkbox" id="nav-toggle" hidden>
<label for="nav-toggle" class="nav-btn" title="目录">☰</label>

<aside class="sidebar">
  <a class="brand" href="${up}index.html">深度学习 500 问</a>
  <p class="brand-sub">离线可读版 · 公式已渲染</p>
  ${navHtml}
</aside>

<main class="content">
  ${tocHtml}
  <article class="markdown-body">
${bodyHtml}
  </article>
  ${pager}
  <footer class="site-footer">
    <p>内容来自 <a href="https://github.com/scutan90/DeepLearning-500-questions">scutan90/DeepLearning-500-questions</a>，以 GPL-3.0 授权。本页为公式预渲染的离线重排版本。</p>
  </footer>
</main>
</body>
</html>
`;
}

function navFor(currentDir, depth) {
  const up = depth === 0 ? '' : '../';
  const items = CHAPTERS.map((c) => {
    const cls = c.dir === currentDir ? ' class="active"' : '';
    const label = Number.isInteger(c.num) ? `${c.num}` : '18′';
    return `<li${cls}><a href="${up}${encodeURI(c.dir)}/"><span class="n">${label}</span>${esc(c.title)}</a></li>`;
  }).join('\n    ');
  return `<nav class="nav"><ol>\n    ${items}\n  </ol></nav>`;
}

// ---------------------------------------------------------------------- build

fs.mkdirSync(ASSETS, { recursive: true });

// KaTeX 的 CSS 与字体拷进 assets/，产物不再依赖网络。
const katexDist = path.join(__dirname, 'node_modules', 'katex', 'dist');
fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(ASSETS, 'katex.min.css'));
fs.mkdirSync(path.join(ASSETS, 'fonts'), { recursive: true });
let fontCount = 0;
for (const f of fs.readdirSync(path.join(katexDist, 'fonts'))) {
  fs.copyFileSync(path.join(katexDist, 'fonts', f), path.join(ASSETS, 'fonts', f));
  fontCount++;
}
fs.copyFileSync(path.join(__dirname, 'style.css'), path.join(ASSETS, 'style.css'));

const stats = [];
let rewritten = 0;

CHAPTERS.forEach((c, i) => {
  const srcPath = path.join(ROOT, c.dir, c.file);
  const src = fs.readFileSync(srcPath, 'utf8');
  const { html, toc, normalized } = renderChapter(src);

  // 把修正后的 Markdown 写回源文件：GitHub 用自己的渲染器预览 .md，
  // 只有源文件本身是干净的，在 GitHub 上直接看才不会再出现裸 LaTeX。
  if (normalized !== src) {
    fs.writeFileSync(srcPath, normalized);
    rewritten++;
  }
  const failed = (html.match(/katex-error/g) || []).length;

  const tocHtml = toc.length
    ? `<details class="toc" open><summary>本章目录（${toc.length} 节）</summary><ul>` +
      toc.map((t) => `<li class="lv${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('') +
      '</ul></details>'
    : '';

  const page = layout({
    title: `第 ${Number.isInteger(c.num) ? c.num : 18} 章 ${c.title}`,
    depth: 1,
    navHtml: navFor(c.dir, 1),
    tocHtml,
    bodyHtml: html,
    prev: CHAPTERS[i - 1],
    next: CHAPTERS[i + 1],
  });

  fs.writeFileSync(path.join(ROOT, c.dir, 'index.html'), page);

  const formulas = (html.match(/katex-mathml/g) || []).length;
  const images = (html.match(/<img /g) || []).length;
  stats.push({ ch: c.title, formulas, images, failed });
});

// 首页
const cards = CHAPTERS.map((c) => `
    <a class="card" href="${encodeURI(c.dir)}/">
      <span class="card-num">${Number.isInteger(c.num) ? c.num : '18′'}</span>
      <span class="card-title">${esc(c.title)}</span>
    </a>`).join('');

const totalF = stats.reduce((a, b) => a + b.formulas, 0);
const totalI = stats.reduce((a, b) => a + b.images, 0);

const home = layout({
  title: '首页',
  depth: 0,
  navHtml: navFor(null, 0),
  tocHtml: '',
  bodyHtml: `
<h1>深度学习 500 问 · 离线可读版</h1>
<p class="lede">原仓库的公式依赖 CDN 上的 MathJax/KaTeX 在浏览器里现场渲染，网络不通时会退化成满屏
<code>$$\\sum_{i=1}^N$$</code> 这样的裸 LaTeX 源码，看起来像乱码。这里把公式在<strong>构建期</strong>渲染成
HTML，产物不加载任何外部资源，断网也能读。</p>
<ul class="facts">
  <li><strong>${CHAPTERS.length}</strong> 个章节</li>
  <li><strong>${totalF.toLocaleString()}</strong> 条公式已预渲染</li>
  <li><strong>${totalI.toLocaleString()}</strong> 张插图（本地）</li>
  <li><strong>0</strong> 个外部依赖</li>
</ul>
<h2>章节</h2>
<div class="cards">${cards}
</div>`,
});
fs.writeFileSync(path.join(ROOT, 'index.html'), home);

// ------------------------------------------------------------------- 构建报告
console.log('章节'.padEnd(30) + '公式'.padStart(8) + '插图'.padStart(8) + '失败'.padStart(8));
for (const s of stats) {
  console.log(s.ch.padEnd(30) + String(s.formulas).padStart(8) + String(s.images).padStart(8) + String(s.failed).padStart(8));
}
console.log('-'.repeat(54));
console.log('合计'.padEnd(30) + String(totalF).padStart(8) + String(totalI).padStart(8) +
  String(stats.reduce((a, b) => a + b.failed, 0)).padStart(8));
console.log(`\nassets: katex.min.css + ${fontCount} 个字体 + style.css`);
console.log(`页面: ${CHAPTERS.length} 个章节页 + 1 个首页；回写 Markdown 源文件 ${rewritten} 个`);
console.log(`源文本修正: 块级公式定界 ${fixes.fence}、跨行行内公式 ${fixes.inline}、` +
  `eqnarray→aligned ${fixes.eqnarray}、下标补花括号 ${fixes.subscript}、` +
  `公式块内混入的正文 ${fixes.strayProse}、相邻行内公式拆分 ${fixes.adjacent}、` +
  `公式内零宽空格 ${fixes.zwsp}、反引号包裹的公式 ${fixes.backtick}、` +
  `行内公式定界符间距 ${fixes.flanking}、改用 GitHub 反引号写法 ${fixes.backtickForm}`);
