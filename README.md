# 伏羲 (Fuxi) - Obsidian Plugin

[中文](#中文) | [English](#english)

---

<a name="中文"></a>

## 伏羲：连接万物的智慧索引

伏羲是一个专为 Obsidian 设计的块管理与智慧索引系统。它的目标是在 Markdown 的自由度与结构化数据的效率之间取得平衡，将 **Roam Research** 风格的块级粒度与 **Tana** 风格的 **Supertag** 功能完美引入 Obsidian。

### 🚀 核心功能

*   **块级粒度管理**：打破文件限制，以“块”为基本单位进行追踪、索引与引用。
*   **Tana 风格 Supertag**：支持结构化标签。
*   **九宫格大纲编辑器 (Sudoku Outliner)**：
    *   **大纲编辑器**：支持快捷键（Enter、Tab、Shift+Tab）快速构建层级。
    *   **支持折叠/展开**：支持在大纲中折叠/展开任意层级，状态实时同步。
    *   **仪表盘**：九宫格管理面板，提供网格/列表双视图。
    *   **个性化定制**：支持设置主题色、选择 Lucide 图标或直接注入原生 SVG 代码。
    *   **模板化**：支持设置模板，实现一键式结构复用。
*   **高性能 SQLite 驱动**：本地高性能数据库存储，确保在大规模笔记库下依然拥有极速的检索体验。
*   **智能实时同步**：自动监听文件修改、重命名及删除事件，利用内容哈希（Content Hashing）实现毫秒级的增量更新。
*   **透明的数据结构**：通过标准的 `files`, `blocks`, `tags` 关系表管理数据，方便二次开发与深度查询。

### 🛠️ 工作原理

伏羲在插件目录下的 `fuxi.db` 中维护数据的实时映射：
1.  **解析**：将 Markdown 文件拆解为独立的块（Blocks）。
2.  **哈希**：为每个块生成唯一内容哈希，精确识别内容变动。
3.  **索引**：建立文件-块-标签的多维关联。
4.  **呈现**：基于索引数据提供 Supertag 属性编辑与块查询视图。
5.  **九宫格大纲**：提供独立的 .jg 文件格式，支持多层级嵌套数据结构与可视化管理。

### 📖 快速开始

1.  安装并启用插件。
2.  插件会自动开始扫描并索引你的仓库。
3.  在块中使用标签或特定元数据，即可触发supertag视图功能。
4.  ctrl + p，即可触发九宫格视图功能。

### 💬 交流与赞赏

| 微信群 | 赞赏码 |
| :---: | :---: |
| <img src="微信群.jpg" width="280" /> | <img src="赞赏码.jpg" width="280" /> |
| 欢迎进入微信群交流反馈 | 您的支持是我持续更新的动力 |

**作者**: Heiye  
**版本**: 0.4

---

<a name="english"></a>

## Fuxi: The Intelligent Index for Everything

Fuxi is a block management and intelligence indexing system designed specifically for Obsidian. It aims to bridge the gap between the flexibility of Markdown and the efficiency of structured data, bringing **Roam Research**-style block granularity and **Tana**-style **Supertag** functionality to your vault.

### 🚀 Key Features

*   **Block-Level Management**: Break free from file boundaries. Track, index, and reference content at the "block" level.
*   **Tana-style Supertag**: Powerful structured tagging.
*   **Sudoku Outliner**:
    *   **Outliner Editor**: Support for hierarchical editing with keyboard shortcuts (Enter, Tab, Shift+Tab).
    *   **Folding Support**: Collapse/Expand nodes at any level with persistent states.
    *   **Dashboard**: A management panel with Grid and List view options.
    *   **Personalization**: Assign theme colors and custom icons (Lucide or raw SVG).
    *   **Templates**: Mark any Sudoku as a template for rapid structure reuse.
*   **SQLite Powered**: High-performance local database ensures blazing-fast retrieval even in massive note collections.
*   **Smart Real-time Sync**: Automatically listens for file modifications, renames, and deletions, utilizing Content Hashing for millisecond-speed incremental updates.
*   **Transparent Data Schema**: Data is managed via standard relational tables (`files`, `blocks`, `tags`), making it extensible and easy to query.

### 🛠️ How It Works

Fuxi maintains a real-time mapping of your data in `fuxi.db` located in the plugin folder:
1.  **Parsing**: Deconstructs Markdown files into individual Blocks.
2.  **Hashing**: Generates a unique content hash for each block to precisely track changes.
3.  **Indexing**: Builds multi-dimensional associations between Files, Blocks, and Tags.
4.  **Rendering**: Provides Supertag property editing and block query views based on the indexed data.
5.  **Sudoku View**: Specialized .jg file format supporting nested tree structures and visual management.

### 📖 Quick Start

1.  Install and enable the plugin.
2.  The plugin will automatically start scanning and indexing your vault.
3.  Use tags or specific metadata within a block to trigger Supertag view features.
4.  Press `Ctrl + P` to search and trigger Sudoku view features.

### 💬 Community & Support

| WeChat Group | Reward Code |
| :---: | :---: |
| <img src="微信群.jpg" width="280" /> | <img src="赞赏码.jpg" width="280" /> |
| Welcome to join our group for feedback | Your support is greatly appreciated |

---

**Author**: Heiye  
**Version**: 0.4

