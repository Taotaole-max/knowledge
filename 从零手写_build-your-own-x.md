# 从零手写 · Build Your Own X

> 学习法速查。核心理念：**"What I cannot create, I do not understand."**（费曼）
> 你以为懂某个技术，直到让你亲手写一个最小实现——卡住的地方就是理解的漏洞。
> 与其被动看教程，不如从零把一个真实技术复刻一遍。

来源仓库：<https://github.com/codecrafters-io/build-your-own-x>（约 54 万 star，GitHub 上 star 最多的学习类仓库）

---

## 这个仓库是什么

- 本质是**一个 README 索引**，仓库本身没有代码。
- 内容是"从零手写各种著名技术"的**分步教程链接合集**，按技术领域分成 30+ 大类。
- 维护方是 CodeCrafters 公司，[codecrafters.io](https://app.codecrafters.io) 是其付费产品（平台上分阶段写自己的 Redis / Git / SQLite，有自动测试验收）。**索引免费，平台收费**，只用免费索引完全够。

### 条目格式

```
[语言]: "教程标题"  → 链接      // 视频教程标 [video]
```

选教程时注意**更新时间和语言**，部分教程较老。

---

## 分类总览

| 方向 | 分类 |
| --- | --- |
| 基础设施 | Database、Docker、Operating System、Web Server、Network Stack (TCP/IP)、Memory Allocator、Processor (CPU) |
| 语言与工具链 | Programming Language、Regex Engine、Template Engine、Text Editor、Shell、Command-Line Tool |
| 应用 | Git、Web Browser、Search Engine、BitTorrent Client、Bot |
| 图形 / 游戏 | 3D Renderer、Game、Physics Engine、Voxel Engine、Emulator / VM |
| AI | Neural Network、AI Model（含手写 LLM、diffusion model）、Visual Recognition System |
| 其他 | Blockchain、Front-end Framework、Augmented Reality |

---

## 各类教程举例

| 分类 | 教程举例 |
| --- | --- |
| Database | **C**: "Let's Build a Simple Database"（cstack，手写 SQLite 式 B-tree）<br>**Go**: "Build Your Own Database from Scratch: From B+Tree To SQL in 3000 Lines" |
| Git | **Python**: "Just enough of a Git client to create a repo, commit, and push itself"<br>**Ruby**: "Rebuilding Git in Ruby" |
| Docker | **Go**: "Build Your Own Container Using Less than 100 Lines of Go"<br>**Bash**: "Docker implemented in around 100 lines of bash" |
| Programming Language | **C**: "Build Your Own Lisp"<br>**Java**: "Crafting Interpreters"（经典书）<br>**JS**: "The Super Tiny Compiler" |
| Neural Network | **Python**: "A Neural Network in 11 lines of Python"<br>**Python**: "Implement a Neural Network from Scratch" |
| Operating System | **Rust**: "Writing an OS in Rust"（Philipp Oppermann 系列）<br>**C**: "Roll your own toy UNIX-clone OS" |
| 3D Renderer | **C++**: "Ray Tracing in One Weekend"<br>**JS**: "Computer Graphics from Scratch" |
| Shell | **C**: "Tutorial - Write a Shell in C"<br>**Rust**: "Build Your Own Shell using Rust" |
| Web Server | **Node.js**: "Build Your Own Web Server From Scratch In JavaScript"<br>**Python**: "Let's Build A Web Server" |

---

## 针对 ML / 计算化学方向的推荐路径

1. **Neural Network from scratch**（纯 NumPy 手写前向 + 反向传播）——搞懂 autograd 到底在干什么，之后用 PyTorch 心里有底。
2. **micrograd**（Karpathy，仓库 AI 分类下）——约 150 行实现一个能训练的自动微分引擎，看一遍胜过十篇博客。
3. **Let's build GPT from scratch**（Karpathy）——从 bigram 到 Transformer。
4. 想练工程能力再选 Database 或 Git。

---

## 使用姿势（重要）

- 它只是**索引**，点进外部链接才是正文。
- 正确流程：读一段 → 自己写 → 卡住再看答案。照抄没有意义。
- 目标是**跑通核心功能**，不是做完整产品。100–500 行就够。
- 挑一个你天天用、却说不清原理的东西下手（Git、HTTP server、JSON 解析器、mini 神经网络框架）。

---

## 同类仓库

| 仓库 | 区别 |
| --- | --- |
| [practical-tutorials/project-based-learning](https://github.com/practical-tutorials/project-based-learning) | 按编程语言划分的"从零做一个应用"教程清单 |
| [Xtremilicious/projectlearn-project-based-learning](https://github.com/Xtremilicious/projectlearn-project-based-learning) | 项目式学习教程策展，配筛选网站 |
| [aquadzn/learn-x-by-doing-y](https://github.com/aquadzn/learn-x-by-doing-y) | 把上述资源聚合成搜索引擎 |

---

*整理于 2026-08-28。*
