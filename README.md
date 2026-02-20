# 伏羲 (Fuxi) - Obsidian Plugin

[中文](#中文) | [English](#english)

---

<a name="中文"></a>

## 伏羲：连接万物的智慧索引

伏羲是一个专为 Obsidian 设计的块管理与智慧索引系统。它的目标是在 Markdown 的自由度与结构化数据的效率之间取得平衡，将 **Roam Research** 风格的块级粒度与 **Tana** 风格的 **Supertag** 功能完美引入 Obsidian。

### 🚀 核心功能

*   **块级粒度管理**：打破文件限制，以“块”为基本单位进行追踪、索引与引用。
*   **Tana 风格 Supertag**：支持结构化标签。当检测到 `SuperTagViewUuid` 等字段时，自动开启强大的 Supertag 视图。
*   **高性能 SQLite 驱动**：本地高性能数据库存储，确保在大规模笔记库下依然拥有极速的检索体验。
*   **智能实时同步**：自动监听文件修改、重命名及删除事件，利用内容哈希（Content Hashing）实现毫秒级的增量更新。
*   **透明的数据结构**：通过标准的 `files`, `blocks`, `tags` 关系表管理数据，方便二次开发与深度查询。

### 🛠️ 工作原理

伏羲在插件目录下的 `fuxi.db` 中维护数据的实时映射：
1.  **解析**：将 Markdown 文件拆解为独立的块（Blocks）。
2.  **哈希**：为每个块生成唯一内容哈希，精确识别内容变动。
3.  **索引**：建立文件-块-标签的多维关联。
4.  **呈现**：基于索引数据提供 Supertag 属性编辑与块查询视图。

### 📖 快速开始

1.  安装并启用插件。
2.  插件会自动开始扫描并索引你的仓库。
3.  在块中使用标签或特定元数据，即可触发高级视图功能。

---

<a name="english"></a>

## Fuxi: The Intelligent Index for Everything

Fuxi is a block management and intelligence indexing system designed specifically for Obsidian. It aims to bridge the gap between the flexibility of Markdown and the efficiency of structured data, bringing **Roam Research**-style block granularity and **Tana**-style **Supertag** functionality to your vault.

### 🚀 Key Features

*   **Block-Level Management**: Break free from file boundaries. Track, index, and reference content at the "block" level.
*   **Tana-style Supertag**: Powerful structured tagging. Automatically activates the Supertag view when fields like `SuperTagViewUuid` are detected.
*   **SQLite Powered**: High-performance local database ensures blazing-fast retrieval even in massive note collections.
*   **Smart Real-time Sync**: Automatically listens for file modifications, renames, and deletions, utilizing Content Hashing for millisecond-speed incremental updates.
*   **Transparent Data Schema**: Data is managed via standard relational tables (`files`, `blocks`, `tags`), making it extensible and easy to query.

### 🛠️ How It Works

Fuxi maintains a real-time mapping of your data in `fuxi.db` located in the plugin folder:
1.  **Parsing**: Deconstructs Markdown files into individual Blocks.
2.  **Hashing**: Generates a unique content hash for each block to precisely track changes.
3.  **Indexing**: Builds multi-dimensional associations between Files, Blocks, and Tags.
4.  **Rendering**: Provides Supertag property editing and block query views based on the indexed data.

### 📖 Quick Start

1.  Install and enable the plugin.
2.  The plugin will automatically start scanning and indexing your vault.
3.  Use tags or specific metadata within a block to trigger advanced view features.

### 💬 交流与反馈 (Community)

欢迎加入微信群进行交流与反馈。

Welcome to join our WeChat group for discussion and feedback.

<p align="center">
  <img src="微信群.jpg" alt="微信群" width="300" />
</p>

### ☕ 支持与赞赏 (Support)

如果您觉得这个插件对您有帮助，欢迎赞赏支持！您的支持是我持续更新的动力。

If you find this plugin helpful, please consider supporting its development. Your support is greatly appreciated!

<p align="center">
  <img src="赞赏码.jpg" alt="赞赏码" width="300" />
</p>

---

**Author**: Heiye
**Version**: 1.0.0
