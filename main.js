const { Plugin, Notice, Modal, Setting, TFile, MarkdownView, ItemView, setIcon, Menu } = require('obsidian');

const SUDOKU_VIEW_TYPE = "sudoku-grid-view";
const SUDOKU_MGMT_VIEW_TYPE = "sudoku-mgmt-view";

// ========== Supertag 颜色映射 ==========
const TAG_COLORS = [
  { bg: 'rgba(108,92,231,0.18)', border: 'rgba(108,92,231,0.5)', text: '#6c5ce7' },
  { bg: 'rgba(0,206,201,0.18)', border: 'rgba(0,206,201,0.5)', text: '#00b8b3' },
  { bg: 'rgba(253,121,168,0.18)', border: 'rgba(253,121,168,0.5)', text: '#e8588a' },
  { bg: 'rgba(255,159,67,0.18)', border: 'rgba(255,159,67,0.5)', text: '#e88b30' },
  { bg: 'rgba(46,213,115,0.18)', border: 'rgba(46,213,115,0.5)', text: '#26b568' },
  { bg: 'rgba(30,144,255,0.18)', border: 'rgba(30,144,255,0.5)', text: '#1a85e5' },
  { bg: 'rgba(255,71,87,0.18)', border: 'rgba(255,71,87,0.5)', text: '#e54050' },
  { bg: 'rgba(162,155,254,0.18)', border: 'rgba(162,155,254,0.5)', text: '#8a80f0' },
];

function getTagColor(tagName) {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ========== 内容哈希计算 (FNV-1a 32-bit) ==========
function computeHash(content) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ========== 块解析器 ==========
// 按空行分割文件内容为块，提取每个块中的标签
function parseFileIntoBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  let currentBlockLines = [];
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (currentBlockLines.length > 0) {
        const blockContent = currentBlockLines.join('\n');
        blocks.push({
          startLine,
          endLine: startLine + currentBlockLines.length - 1,
          content: blockContent,
          contentHash: computeHash(blockContent),
          tags: extractTags(blockContent),
        });
        currentBlockLines = [];
        startLine = -1;
      }
    } else {
      if (startLine === -1) startLine = i;
      currentBlockLines.push(lines[i]);
    }
  }

  // 处理尾部块（文件不以空行结尾）
  if (currentBlockLines.length > 0) {
    const blockContent = currentBlockLines.join('\n');
    blocks.push({
      startLine,
      endLine: startLine + currentBlockLines.length - 1,
      content: blockContent,
      contentHash: computeHash(blockContent),
      tags: extractTags(blockContent),
    });
  }

  return blocks;
}

// 从块内容中提取 #tag 格式的标签
function extractTags(content) {
  const tags = [];
  const regex = /#([\w\u4e00-\u9fff][\w\u4e00-\u9fff/\-]*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // 跳过 Markdown 标题（## / ### 等）
    if (match.index > 0 && content[match.index - 1] === '#') continue;
    tags.push({ name: match[1], position: match.index });
  }
  return tags;
}

// ========== 属性类型定义 ==========
const PROP_TYPES = [
  { value: 1, label: '文本' },
  { value: 2, label: '数字' },
  { value: 3, label: '图片' },
  { value: 4, label: '链接' },
  { value: 5, label: '位置' },
  { value: 6, label: '电话' },
  { value: 7, label: '邮箱' },
  { value: 8, label: '布尔值' },
  { value: 9, label: '日期' },
  { value: 10, label: '时间' },
  { value: 11, label: '日期与时间' },
  { value: 12, label: '单选' },
  { value: 13, label: '多选' },
];

const PROP_TYPE_ICONS = (() => {
  const s = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    1: { icon: s('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'), label: '文本' },
    2: { icon: s('<path d="M4 18V6"/><path d="M20 6v12"/><path d="M8 18h2"/><path d="M14 18h2"/><path d="M8 6h2"/><path d="M14 6h2"/><path d="M10 6l-2 12"/><path d="M16 6l-2 12"/>'), label: '数字' },
    3: { icon: s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'), label: '图片' },
    4: { icon: s('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'), label: '链接' },
    5: { icon: s('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'), label: '位置' },
    6: { icon: s('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>'), label: '电话' },
    7: { icon: s('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'), label: '邮箱' },
    8: { icon: s('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/>'), label: '布尔值' },
    9: { icon: s('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>'), label: '日期' },
    10: { icon: s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'), label: '时间' },
    11: { icon: s('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M15 15l2 2"/><circle cx="14" cy="15" r="2"/>'), label: '日期与时间' },
    12: { icon: s('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'), label: '单选' },
    13: { icon: s('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'), label: '多选' },
  };
})();

// ========== 数据库操作 (Supertag 属性) ==========
class SupertagDB {
  constructor(SQL, dbData) {
    this.db = new SQL.Database(new Uint8Array(dbData));
  }

  getSupertags() {
    const result = {};
    // 从 tags 表获取所有标签
    const tagStmt = this.db.prepare('SELECT name FROM tags');
    while (tagStmt.step()) {
      result[tagStmt.getAsObject().name] = { properties: [] };
    }
    tagStmt.free();
    // 从 tag_properties 表获取属性
    const propStmt = this.db.prepare('SELECT tagName, name, pos, type FROM tag_properties');
    while (propStmt.step()) {
      const row = propStmt.getAsObject();
      if (result[row.tagName]) {
        result[row.tagName].properties.push({ name: row.name, pos: row.pos, type: row.type });
      }
    }
    propStmt.free();
    return result;
  }

  getSupertag(tagName) { return this.getSupertags()[tagName] || null; }

  addProperty(tagName, propName, propType, propPos) {
    this.db.run('INSERT INTO tag_properties (tagName, name, pos, type) VALUES (?, ?, ?, ?)',
      [tagName, propName, propPos, propType]);
  }

  updateProperty(tagName, oldName, newName, newType) {
    this.db.run('UPDATE tag_properties SET name = ?, type = ? WHERE tagName = ? AND name = ?',
      [newName, newType, tagName, oldName]);
  }

  deleteProperty(tagName, propName) {
    this.db.run('DELETE FROM tag_properties WHERE tagName = ? AND name = ?', [tagName, propName]);
  }

  export() { return this.db.export(); }
  close() { if (this.db) this.db.close(); }
}

// ========== 块同步引擎 ==========
class BlockSyncEngine {
  constructor(plugin) {
    this.plugin = plugin;
    this.db = null;
    this.SQL = null;
    this._saveTimer = null;
  }

  async init() {
    this.SQL = await this.plugin.getSQLEngine();
    const dbPath = this.plugin.getDbPath();
    const exists = await this.plugin.app.vault.adapter.exists(dbPath);
    if (exists) {
      const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
      this.db = new this.SQL.Database(new Uint8Array(dbData));
    } else {
      this.db = new this.SQL.Database();
    }
    this._ensureTables();
    await this._saveDb();
  }

  _ensureTables() {
    this.db.run('PRAGMA foreign_keys = ON');

    // ===== 文件与块同步表 =====
    this.db.run(`CREATE TABLE IF NOT EXISTS files (
      uuid TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, content TEXT,
      hash TEXT, lineCount INTEGER, modifiedAt INTEGER, syncedAt INTEGER
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY, fileUUID TEXT NOT NULL,
      startLine INTEGER NOT NULL, endLine INTEGER NOT NULL,
      content TEXT NOT NULL, contentHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      FOREIGN KEY (fileUUID) REFERENCES files(uuid) ON DELETE CASCADE
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY, createdAt INTEGER NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS block_tags (
      blockId TEXT NOT NULL, tagName TEXT NOT NULL, position INTEGER,
      PRIMARY KEY (blockId, tagName),
      FOREIGN KEY (blockId) REFERENCES blocks(id) ON DELETE CASCADE,
      FOREIGN KEY (tagName) REFERENCES tags(name)
    )`);

    // ===== 标签属性表（Supertag 属性定义） =====
    this.db.run(`CREATE TABLE IF NOT EXISTS tag_properties (
      tagName TEXT NOT NULL, name TEXT NOT NULL,
      pos INTEGER, type INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tagName, name),
      FOREIGN KEY (tagName) REFERENCES tags(name) ON DELETE CASCADE
    )`);

    // ===== 标签属性值表（每个块-标签实例的实际值，不级联删除） =====
    this.db.run(`CREATE TABLE IF NOT EXISTS tag_values (
      blockId TEXT NOT NULL,
      tagName TEXT NOT NULL,
      propName TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (blockId, tagName, propName),
      FOREIGN KEY (tagName, propName) REFERENCES tag_properties(tagName, name) ON DELETE CASCADE
    )`);

    // ===== 索引 =====
    this.db.run('CREATE INDEX IF NOT EXISTS idx_blocks_fileUUID ON blocks(fileUUID)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_block_tags_blockId ON block_tags(blockId)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tag_properties_tagName ON tag_properties(tagName)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tag_values_block ON tag_values(blockId)');

    // ===== 九宫格相关的表 =====
    this.db.run(`CREATE TABLE IF NOT EXISTS sudoku_folders (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pos INTEGER DEFAULT 0,
      created_at INTEGER
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS sudokus (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_uuid TEXT,
      is_pinned INTEGER DEFAULT 0,
      pinned_at INTEGER,
      theme_color TEXT,
      icon TEXT,
      is_template INTEGER DEFAULT 0,
      created_at INTEGER,
      modified_at INTEGER,
      FOREIGN KEY (folder_uuid) REFERENCES sudoku_folders(uuid) ON DELETE SET NULL
    )`);

    // 检查并升级 sudokus 表（添加缺失字段）
    const columns = [
      { name: 'folder_uuid', type: 'TEXT' },
      { name: 'is_pinned', type: 'INTEGER DEFAULT 0' },
      { name: 'pinned_at', type: 'INTEGER' },
      { name: 'theme_color', type: 'TEXT' },
      { name: 'icon', type: 'TEXT' },
      { name: 'is_template', type: 'INTEGER DEFAULT 0' },
      { name: 'created_at', type: 'INTEGER' },
      { name: 'modified_at', type: 'INTEGER' }
    ];

    for (const col of columns) {
      try {
        this.db.run(`ALTER TABLE sudokus ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {
        // 如果列已存在会报错，忽略即可
      }
    }

    this.db.run(`CREATE TABLE IF NOT EXISTS sudoku_cells_cache (
      sudoku_uuid TEXT,
      cell_index INTEGER,
      cell_name TEXT,
      cell_content TEXT,
      has_content INTEGER,
      PRIMARY KEY (sudoku_uuid, cell_index),
      FOREIGN KEY (sudoku_uuid) REFERENCES sudokus(uuid) ON DELETE CASCADE
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS sudoku_tags (
      sudoku_uuid TEXT,
      tag_name TEXT,
      PRIMARY KEY (sudoku_uuid, tag_name),
      FOREIGN KEY (sudoku_uuid) REFERENCES sudokus(uuid) ON DELETE CASCADE
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS sudoku_access_log (
      sudoku_uuid TEXT PRIMARY KEY,
      last_access INTEGER,
      FOREIGN KEY (sudoku_uuid) REFERENCES sudokus(uuid) ON DELETE CASCADE
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS sudoku_pinned_tags (
      tag_name TEXT PRIMARY KEY,
      pos INTEGER
    )`);
  }

  // 同步单个九宫格到数据库
  syncSudoku(uuid, name, stats = null, data = null) {
    if (!this.db) return;
    if (stats) {
      // 使用 UPSERT 逻辑，避免 REPLACE 摧毁已有状态（如下面的 is_pinned）
      this.db.run(`INSERT INTO sudokus (uuid, name, created_at, modified_at) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uuid) DO UPDATE SET 
          name = excluded.name,
          modified_at = excluded.modified_at,
          created_at = COALESCE(sudokus.created_at, excluded.created_at)`,
        [uuid, name, Math.floor(stats.ctime / 1000), Math.floor(stats.mtime / 1000)]);
    } else {
      this.db.run(`INSERT INTO sudokus (uuid, name) VALUES (?, ?) 
        ON CONFLICT(uuid) DO UPDATE SET name=excluded.name`, [uuid, name]);
    }

    // Phase 3: 内容缓存化写入
    if (data && data.cells) {
      this.db.run('DELETE FROM sudoku_cells_cache WHERE sudoku_uuid = ?', [uuid]);
      data.cells.forEach((cell, idx) => {
        const cellName = cell.name || '';
        const cellContent = cell.content || '';
        const hasContent = (cellName.trim() !== '' || cellContent.trim() !== '') ? 1 : 0;
        this.db.run(`INSERT INTO sudoku_cells_cache 
          (sudoku_uuid, cell_index, cell_name, cell_content, has_content) 
          VALUES (?, ?, ?, ?, ?)`,
          [uuid, idx, cellName, cellContent, hasContent]);
      });
    }

    this._debouncedSave();
  }

  // 切换置顶状态
  togglePin(uuid) {
    if (!this.db) return;
    const now = Math.floor(Date.now() / 1000);
    this.db.run(`UPDATE sudokus SET is_pinned = 1 - is_pinned, pinned_at = ? WHERE uuid = ?`, [now, uuid]);
    this._debouncedSave();
  }

  setThemeColor(uuid, color) {
    if (!this.db) return;
    this.db.run('UPDATE sudokus SET theme_color = ? WHERE uuid = ?', [color, uuid]);
    this._debouncedSave();
  }

  setIcon(uuid, iconName) {
    if (!this.db) return;
    this.db.run('UPDATE sudokus SET icon = ? WHERE uuid = ?', [iconName, uuid]);
    this._debouncedSave();
  }

  setAsTemplate(uuid, isTemplate) {
    if (!this.db) return;
    this.db.run('UPDATE sudokus SET is_template = ? WHERE uuid = ?', [isTemplate ? 1 : 0, uuid]);
    this._debouncedSave();
  }

  // 获取九宫格列表（支持过滤和排序：置顶优先，其次按修改时间）
  getSudokus(filter = '') {
    if (!this.db) return [];
    let sql = `SELECT * FROM sudokus`;
    let params = [];
    if (filter) {
      sql = `SELECT DISTINCT s.* FROM sudokus s 
             LEFT JOIN sudoku_cells_cache c ON s.uuid = c.sudoku_uuid 
             WHERE s.name LIKE ? OR c.cell_content LIKE ? OR c.cell_name LIKE ?`;
      const searchStr = `%${filter}%`;
      params.push(searchStr, searchStr, searchStr);
    }
    sql += ` ORDER BY is_pinned DESC, pinned_at DESC, modified_at DESC, name ASC`;

    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // 从数据库删除九宫格
  deleteSudoku(uuid) {
    if (!this.db) return;
    this.db.run('DELETE FROM sudokus WHERE uuid = ?', [uuid]);
    this._debouncedSave();
  }

  getTemplates() {
    if (!this.db) return [];
    const stmt = this.db.prepare('SELECT * FROM sudokus WHERE is_template = 1 ORDER BY name ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // ========== 最近访问与标签系统 ==========

  logAccess(uuid) {
    if (!this.db) return;
    const now = Math.floor(Date.now() / 1000);
    this.db.run(`INSERT INTO sudoku_access_log (sudoku_uuid, last_access) VALUES (?, ?) 
        ON CONFLICT(sudoku_uuid) DO UPDATE SET last_access=excluded.last_access`, [uuid, now]);
    this._debouncedSave();
  }

  getRecentAccess(limit = 6) {
    if (!this.db) return [];
    let sql = `SELECT s.* FROM sudokus s 
               JOIN sudoku_access_log a ON s.uuid = a.sudoku_uuid 
               ORDER BY a.last_access DESC LIMIT ?`;
    const stmt = this.db.prepare(sql);
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getSudokuTags() {
    if (!this.db) return {};
    const results = {};
    const stmt = this.db.prepare('SELECT sudoku_uuid, tag_name FROM sudoku_tags');
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (!results[row.sudoku_uuid]) results[row.sudoku_uuid] = [];
      results[row.sudoku_uuid].push(row.tag_name);
    }
    stmt.free();
    return results;
  }

  setSudokuTags(uuid, tagsArray) {
    if (!this.db) return;
    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run('DELETE FROM sudoku_tags WHERE sudoku_uuid = ?', [uuid]);
      for (const tag of tagsArray) {
        if (tag.trim()) {
          this.db.run('INSERT INTO sudoku_tags (sudoku_uuid, tag_name) VALUES (?, ?)', [uuid, tag.trim()]);
        }
      }
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      console.error('Failed to set tags:', e);
    }
    this._debouncedSave();
  }

  getPinnedTags() {
    if (!this.db) return [];
    const stmt = this.db.prepare('SELECT tag_name FROM sudoku_pinned_tags ORDER BY pos ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject().tag_name);
    }
    stmt.free();
    return results;
  }

  pinTag(tagName) {
    if (!this.db) return;
    const maxPosObj = this.db.exec('SELECT MAX(pos) as maxPos FROM sudoku_pinned_tags')[0];
    const newPos = (maxPosObj?.values?.[0]?.[0] !== null ? maxPosObj.values[0][0] : 0) + 1;
    this.db.run('INSERT OR IGNORE INTO sudoku_pinned_tags (tag_name, pos) VALUES (?, ?)', [tagName, newPos]);
    this._debouncedSave();
  }

  unpinTag(tagName) {
    if (!this.db) return;
    this.db.run('DELETE FROM sudoku_pinned_tags WHERE tag_name = ?', [tagName]);
    this._debouncedSave();
  }

  getAllUniqueTags() {
    if (!this.db) return [];
    const results = [];
    const stmt = this.db.prepare('SELECT DISTINCT tag_name FROM sudoku_tags ORDER BY tag_name ASC');
    while (stmt.step()) {
      results.push(stmt.getAsObject().tag_name);
    }
    stmt.free();
    return results;
  }

  // ========== 虚拟文件夹管理 ==========

  getFolders() {
    if (!this.db) return [];
    const results = [];
    const stmt = this.db.prepare('SELECT * FROM sudoku_folders ORDER BY pos ASC, created_at ASC');
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  createFolder(name) {
    if (!this.db) return null;
    const uuid = generateUUID();
    const now = Math.floor(Date.now() / 1000);
    let pos = 0;
    const stmt = this.db.prepare('SELECT MAX(pos) as maxPos FROM sudoku_folders');
    if (stmt.step()) {
      pos = (stmt.getAsObject().maxPos || 0) + 1;
    }
    stmt.free();
    this.db.run('INSERT INTO sudoku_folders (uuid, name, pos, created_at) VALUES (?, ?, ?, ?)', [uuid, name, pos, now]);
    this._debouncedSave();
    return uuid;
  }

  deleteFolder(uuid) {
    if (!this.db) return;
    // sudokus 表设置了 ON DELETE SET NULL，所以属于该文件夹的项会被自动移出
    this.db.run('DELETE FROM sudoku_folders WHERE uuid = ?', [uuid]);
    this._debouncedSave();
  }

  renameFolder(uuid, newName) {
    if (!this.db) return;
    try {
      this.db.run('UPDATE sudoku_folders SET name = ? WHERE uuid = ?', [newName, uuid]);
      this._debouncedSave();
    } catch (e) {
      console.error('Rename folder failed (maybe name already exists):', e);
      throw e;
    }
  }

  moveToFolder(sudoku_uuid, folder_uuid) {
    if (!this.db) return;
    this.db.run('UPDATE sudokus SET folder_uuid = ? WHERE uuid = ?', [folder_uuid, sudoku_uuid]);
    this._debouncedSave();
  }

  async syncFile(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    try {
      const content = await this.plugin.app.vault.read(file);
      const contentHash = computeHash(content);
      const lineCount = content.split('\n').length;
      const now = Math.floor(Date.now() / 1000);

      let fileUUID = null, oldHash = null;
      const stmt = this.db.prepare('SELECT uuid, hash FROM files WHERE path = ?');
      stmt.bind([file.path]);
      if (stmt.step()) { const r = stmt.getAsObject(); fileUUID = r.uuid; oldHash = r.hash; }
      stmt.free();

      if (fileUUID && oldHash === contentHash) return; // 内容未变

      this.db.run('BEGIN TRANSACTION');
      try {
        if (!fileUUID) {
          fileUUID = generateUUID();
          this.db.run('INSERT INTO files (uuid,path,content,hash,lineCount,modifiedAt,syncedAt) VALUES (?,?,?,?,?,?,?)',
            [fileUUID, file.path, content, contentHash, lineCount, now, now]);
        } else {
          this.db.run('UPDATE files SET content=?,hash=?,lineCount=?,modifiedAt=?,syncedAt=? WHERE uuid=?',
            [content, contentHash, lineCount, now, now, fileUUID]);
        }

        const newBlocks = parseFileIntoBlocks(content);

        // 获取现有块（含 startLine 用于位置匹配）
        const existingBlocks = [];
        const bStmt = this.db.prepare('SELECT id, contentHash, startLine FROM blocks WHERE fileUUID = ?');
        bStmt.bind([fileUUID]);
        while (bStmt.step()) existingBlocks.push(bStmt.getAsObject());
        bStmt.free();

        const existingHashToId = {};
        const existingPosToBlock = {}; // startLine → {id, contentHash}
        existingBlocks.forEach(b => {
          if (!existingHashToId[b.contentHash]) existingHashToId[b.contentHash] = b.id;
          existingPosToBlock[b.startLine] = b;
        });
        const usedIds = new Set();

        // 两阶段匹配，确保 hash 匹配（精确）优先于位置匹配（模糊）
        // 这样插入新块不会"偷走"被推下去的旧块的 ID

        // === 阶段1：hash 匹配（内容未变的块，优先保留 ID）===
        const blockAssignment = new Map(); // newBlock index → reused blockId
        newBlocks.forEach((block, idx) => {
          const eid = existingHashToId[block.contentHash];
          if (eid && !usedIds.has(eid)) {
            usedIds.add(eid);
            blockAssignment.set(idx, eid);
            this.db.run('UPDATE blocks SET startLine=?,endLine=?,updatedAt=? WHERE id=?',
              [block.startLine, block.endLine, now, eid]);
          }
        });

        // === 阶段2：位置匹配（内容变了但位置没变的块）===
        newBlocks.forEach((block, idx) => {
          if (blockAssignment.has(idx)) return; // 已在阶段1匹配
          const posMatch = existingPosToBlock[block.startLine];
          if (posMatch && !usedIds.has(posMatch.id)) {
            usedIds.add(posMatch.id);
            blockAssignment.set(idx, posMatch.id);
            this.db.run('UPDATE blocks SET content=?,contentHash=?,startLine=?,endLine=?,updatedAt=? WHERE id=?',
              [block.content, block.contentHash, block.startLine, block.endLine, now, posMatch.id]);
            // 更新该块的标签关联
            this.db.run('DELETE FROM block_tags WHERE blockId=?', [posMatch.id]);
            block.tags.forEach(tag => {
              this.db.run('INSERT OR IGNORE INTO tags (name,createdAt) VALUES (?,?)', [tag.name, now]);
              this.db.run('INSERT OR IGNORE INTO block_tags (blockId,tagName,position) VALUES (?,?,?)', [posMatch.id, tag.name, tag.position]);
            });
          }
        });

        // === 阶段3：为未匹配的块创建新 ID ===
        newBlocks.forEach((block, idx) => {
          if (blockAssignment.has(idx)) return;
          const blockId = generateUUID();
          this.db.run('INSERT INTO blocks (id,fileUUID,startLine,endLine,content,contentHash,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
            [blockId, fileUUID, block.startLine, block.endLine, block.content, block.contentHash, now, now]);
          block.tags.forEach(tag => {
            this.db.run('INSERT OR IGNORE INTO tags (name,createdAt) VALUES (?,?)', [tag.name, now]);
            this.db.run('INSERT OR IGNORE INTO block_tags (blockId,tagName,position) VALUES (?,?,?)', [blockId, tag.name, tag.position]);
          });
        });

        // 删除不再匹配的旧块（不影响 tag_values，因为无 CASCADE）
        existingBlocks.forEach(b => {
          if (!usedIds.has(b.id)) this.db.run('DELETE FROM blocks WHERE id=?', [b.id]);
        });

        // 清理孤立的 tag_values
        // 1. blockId 不再存在（块被删除）
        this.db.run(`DELETE FROM tag_values WHERE blockId NOT IN (SELECT id FROM blocks)`);
        // 2. 块的标签已更换（block-tag 关联不再存在）
        this.db.run(`DELETE FROM tag_values WHERE NOT EXISTS (
          SELECT 1 FROM block_tags bt WHERE bt.blockId = tag_values.blockId AND bt.tagName = tag_values.tagName
        )`);

        this.db.run('COMMIT');
      } catch (e) { this.db.run('ROLLBACK'); throw e; }
      this._debouncedSave();
    } catch (e) { console.error('[BlockSync] syncFile error:', file.path, e); }
  }

  async handleRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    try {
      this.db.run('UPDATE files SET path=? WHERE path=?', [file.path, oldPath]);
      this._debouncedSave();
    } catch (e) { console.error('[BlockSync] handleRename error:', e); }
  }

  async handleDelete(filePath) {
    try {
      const stmt = this.db.prepare('SELECT uuid FROM files WHERE path=?');
      stmt.bind([filePath]);
      if (stmt.step()) {
        const fileUUID = stmt.getAsObject().uuid;
        stmt.free();
        // 先清理该文件所有块的属性值
        this.db.run(`DELETE FROM tag_values WHERE blockId IN
          (SELECT id FROM blocks WHERE fileUUID = ?)`, [fileUUID]);
        this.db.run('DELETE FROM blocks WHERE fileUUID=?', [fileUUID]);
        this.db.run('DELETE FROM files WHERE uuid=?', [fileUUID]);
        this._cleanOrphanTags();
      } else { stmt.free(); }
      this._debouncedSave();
    } catch (e) { console.error('[BlockSync] handleDelete error:', e); }
  }

  async initialSync() {
    const files = this.plugin.app.vault.getMarkdownFiles();
    for (const file of files) await this.syncFile(file);

    // 同步九宫格文件
    await this.syncAllSudokus();

    await this._saveDb();
    console.log(`[BlockSync] Initial sync complete: ${files.length} files`);
  }

  // 扫描所有 .jg 文件并同步到数据库
  async syncAllSudokus() {
    const jgFolder = `${this.plugin.manifest.dir}/.jg`;
    const adapter = this.plugin.app.vault.adapter;

    if (!(await adapter.exists(jgFolder))) return;

    const files = await adapter.list(jgFolder);
    const jgFiles = files.files.filter(f => f.endsWith('.jg'));

    for (const filePath of jgFiles) {
      try {
        const uuid = filePath.split('/').pop().replace('.jg', '');
        const stats = await adapter.stat(filePath);
        const content = await adapter.read(filePath);
        const data = JSON.parse(content);
        if (data && data.name) {
          this.syncSudoku(uuid, data.name, stats, data);
        }
      } catch (e) {
        console.error('[SudokuSync] Failed to sync:', filePath, e);
      }
    }
  }

  // 清理孤立标签：从 tags 表删除不再被任何块引用的标签（tag_properties 通过外键级联自动删除）
  _cleanOrphanTags() {
    this.db.run('DELETE FROM tags WHERE name NOT IN (SELECT DISTINCT tagName FROM block_tags)');
  }

  _debouncedSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveDb(), 2000);
  }

  async _saveDb() {
    try {
      const data = this.db.export();
      await this.plugin.app.vault.adapter.writeBinary(this.plugin.getDbPath(), data);
    } catch (e) { console.error('[BlockSync] saveDb error:', e); }
  }

  close() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this.db) this.db.close();
  }

  // 从磁盘重新加载数据库（模态框保存后调用）
  async reload() {
    try {
      const dbPath = this.plugin.getDbPath();
      const exists = await this.plugin.app.vault.adapter.exists(dbPath);
      if (exists) {
        const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
        if (this.db) this.db.close();
        this.db = new this.SQL.Database(new Uint8Array(dbData));
        this.db.run('PRAGMA foreign_keys = ON');
      }
    } catch (e) { console.error('[BlockSync] reload error:', e); }
  }
}

// ========== Supertag 编辑模态框 ==========
class SupertagEditorModal extends Modal {
  constructor(app, plugin, tagName, onSaved) {
    super(app);
    this.plugin = plugin;
    this.tagName = tagName;
    this.onSaved = onSaved;
    this.stdb = null;
    this.tagDef = null;
    this.editingProps = [];
    this.isNewTag = false;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('supertag-editor-modal');
    try {
      const SQL = await this.plugin.getSQLEngine();
      const dbPath = this.plugin.getDbPath();
      const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
      this.stdb = new SupertagDB(SQL, dbData);
      this.tagDef = this.stdb.getSupertag(this.tagName);
      if (!this.tagDef) {
        this.isNewTag = true;
        this.editingProps = [];
      } else {
        this.editingProps = this.tagDef.properties.map(p => ({ ...p, _deleted: false, _original: p.name }));
      }
      this._renderEditor();
    } catch (e) {
      console.error('打开 Supertag 编辑器失败:', e);
      contentEl.createEl('p', { text: `加载失败: ${e.message}` });
    }
  }

  _renderEditor() {
    const { contentEl } = this;
    contentEl.empty();
    const color = getTagColor(this.tagName);

    const header = contentEl.createDiv({ cls: 'supertag-editor-header' });
    const titleRow = header.createDiv({ cls: 'supertag-editor-title-row' });
    const pill = titleRow.createEl('span', { cls: 'supertag-pill supertag-pill-lg' });
    pill.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:${color.text};`;
    pill.createEl('span', { text: '#', cls: 'supertag-pill-hash' });
    pill.createEl('span', { text: this.tagName });
    if (this.isNewTag) {
      titleRow.createEl('span', { text: '（新建）', cls: 'supertag-editor-new-badge' });
    }
    header.createEl('p', {
      text: this.isNewTag
        ? `Supertag "${this.tagName}" 尚未定义，保存后将自动创建。`
        : `编辑 Supertag "${this.tagName}" 的属性字段。`,
      cls: 'supertag-editor-desc',
    });

    const propsSection = contentEl.createDiv({ cls: 'supertag-editor-props' });
    propsSection.createEl('h3', { text: '属性字段' });
    const activeProps = this.editingProps.filter(p => !p._deleted);

    if (activeProps.length === 0) {
      propsSection.createEl('p', { text: '暂无属性字段，点击下方按钮添加。', cls: 'supertag-editor-empty' });
    } else {
      const propsList = propsSection.createDiv({ cls: 'supertag-editor-props-list' });
      activeProps.forEach((prop, index) => {
        const propRow = propsList.createDiv({ cls: 'supertag-editor-prop-row' });
        propRow.createEl('span', { text: `${index + 1}`, cls: 'supertag-editor-prop-num' });
        const nameInput = propRow.createEl('input', { cls: 'supertag-editor-prop-input' });
        nameInput.type = 'text'; nameInput.value = prop.name; nameInput.placeholder = '属性名称';
        nameInput.oninput = (e) => { prop.name = e.target.value; };
        const typeSelect = propRow.createEl('select', { cls: 'supertag-editor-prop-select' });
        PROP_TYPES.forEach(pt => {
          const opt = typeSelect.createEl('option', { text: pt.label, value: String(pt.value) });
          if (pt.value === prop.type) opt.selected = true;
        });
        typeSelect.onchange = (e) => { prop.type = parseInt(e.target.value); };
        const delBtn = propRow.createEl('button', { text: '✕', cls: 'supertag-editor-prop-del' });
        delBtn.onclick = () => { prop._deleted = true; this._renderEditor(); };
      });
    }

    const addBtn = propsSection.createEl('button', { text: '＋ 添加属性', cls: 'supertag-editor-add-btn' });
    addBtn.onclick = () => {
      this.editingProps.push({ name: '', pos: this.editingProps.length, type: 1, _deleted: false, _original: null });
      this._renderEditor();
    };

    const btnBar = contentEl.createDiv({ cls: 'supertag-editor-btn-bar' });
    btnBar.createEl('button', { text: '保存', cls: 'mod-cta' }).onclick = () => this._save();
    btnBar.createEl('button', { text: '取消' }).onclick = () => this.close();
  }

  async _save() {
    try {
      const dbPath = this.plugin.getDbPath();
      const tagName = this.tagName;
      // 如果是新标签，确保 tags 表中有记录
      if (this.isNewTag) {
        const now = Math.floor(Date.now() / 1000);
        this.stdb.db.run('INSERT OR IGNORE INTO tags (name,createdAt) VALUES (?,?)',
          [tagName, now]);
      }
      // 删除已标记删除的属性
      this.editingProps.filter(p => p._deleted && p._original).forEach(p => { this.stdb.deleteProperty(tagName, p._original); });
      // 新增或更新属性
      this.editingProps.filter(p => !p._deleted).forEach((p, idx) => {
        if (!p.name || p.name.trim() === '') return;
        if (p._original === null) { this.stdb.addProperty(tagName, p.name.trim(), p.type, idx); }
        else if (p.name !== p._original || p.type !== this.tagDef.properties.find(op => op.name === p._original)?.type) {
          this.stdb.updateProperty(tagName, p._original, p.name.trim(), p.type);
        }
      });
      const exported = this.stdb.export();
      await this.plugin.app.vault.adapter.writeBinary(dbPath, exported);
      // 通知同步引擎重新加载
      if (this.plugin._syncEngine) await this.plugin._syncEngine.reload();
      new Notice(`Supertag "${this.tagName}" 已保存`);
      if (this.onSaved) this.onSaved();
      this.close();
    } catch (e) { console.error('保存失败:', e); new Notice('保存失败: ' + e.message); }
  }

  onClose() { this.contentEl.empty(); if (this.stdb) this.stdb.close(); }
}

// ========== Supertag 属性预览模态框 ==========
class SupertagPropertiesModal extends Modal {
  constructor(app, plugin, tagName) {
    super(app);
    this.plugin = plugin;
    this.tagName = tagName;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('supertag-props-modal');
    contentEl.empty();
    const color = getTagColor(this.tagName);
    const dbPath = this.plugin.getDbPath();

    const header = contentEl.createDiv({ cls: 'supertag-props-header' });
    const pill = header.createEl('span', { cls: 'supertag-pill supertag-pill-lg' });
    pill.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:${color.text};`;
    pill.createEl('span', { text: '#', cls: 'supertag-pill-hash' });
    pill.createEl('span', { text: this.tagName });

    try {
      const SQL = await this.plugin.getSQLEngine();
      const exists = await this.plugin.app.vault.adapter.exists(dbPath);
      let properties = [];
      if (exists) {
        const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
        const stdb = new SupertagDB(SQL, dbData);
        const tagDef = stdb.getSupertag(this.tagName);
        stdb.close();
        if (tagDef) properties = tagDef.properties;
      }

      const body = contentEl.createDiv({ cls: 'supertag-props-body' });
      if (properties.length === 0) {
        body.createEl('p', { text: '暂无属性定义', cls: 'supertag-props-empty' });
      } else {
        const list = body.createDiv({ cls: 'supertag-props-list' });
        properties.forEach(prop => {
          const row = list.createDiv({ cls: 'supertag-prop-row' });
          const typeInfo = PROP_TYPE_ICONS[prop.type] || { icon: '?', label: '未知' };
          const iconEl = row.createEl('span', { cls: 'supertag-prop-icon', attr: { 'aria-label': typeInfo.label } });
          iconEl.innerHTML = typeInfo.icon;
          row.createEl('span', { text: prop.name, cls: 'supertag-prop-name' });
          row.createEl('span', { text: this._getDefaultValue(prop.type), cls: 'supertag-prop-value' });
        });
      }

      const footer = contentEl.createDiv({ cls: 'supertag-props-footer' });
      footer.createEl('button', { text: '✎ 编辑定义', cls: 'mod-cta' }).onclick = () => {
        this.close();
        new SupertagEditorModal(this.plugin.app, this.plugin, this.tagName, () => {
          new SupertagPropertiesModal(this.plugin.app, this.plugin, this.tagName).open();
        }).open();
      };
      footer.createEl('button', { text: '关闭' }).onclick = () => this.close();
    } catch (e) {
      console.error('加载属性失败:', e);
      contentEl.createEl('p', { text: '加载失败: ' + e.message });
    }
  }

  _getDefaultValue(type) {
    switch (type) {
      case 1: return '—';
      case 2: return '—';
      case 3: return '0';
      case 4: return '☐';
      case 5: { const d = new Date(); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
      default: return '—';
    }
  }

  onClose() { this.contentEl.empty(); }
}

// ========== Supertag 属性值编辑模态框 ==========
class SupertagValuesModal extends Modal {
  constructor(app, plugin, tagName, filePath, lineHint) {
    super(app);
    this.plugin = plugin;
    this.tagName = tagName;
    this.filePath = filePath;
    this.lineHint = lineHint;
    this.db = null;
    this.blockId = null;
    this.properties = [];
    this.values = {};
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('supertag-values-modal');
    try {
      const SQL = await this.plugin.getSQLEngine();
      const dbPath = this.plugin.getDbPath();
      const exists = await this.plugin.app.vault.adapter.exists(dbPath);
      if (!exists) { contentEl.createEl('p', { text: '数据库不存在' }); return; }

      const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
      this.db = new SQL.Database(new Uint8Array(dbData));

      // 获取属性定义
      const propStmt = this.db.prepare('SELECT name, type FROM tag_properties WHERE tagName = ? ORDER BY pos');
      propStmt.bind([this.tagName]);
      while (propStmt.step()) this.properties.push(propStmt.getAsObject());
      propStmt.free();

      if (this.properties.length === 0) {
        this._renderNoProps();
        return;
      }

      // 定位具体块
      this.blockId = this._findBlockId();
      if (!this.blockId) {
        contentEl.createEl('p', { text: '未找到对应的内容块，请确保文件已同步。' });
        return;
      }

      // 加载已有值
      const valStmt = this.db.prepare('SELECT propName, value FROM tag_values WHERE blockId = ? AND tagName = ?');
      valStmt.bind([this.blockId, this.tagName]);
      while (valStmt.step()) {
        const row = valStmt.getAsObject();
        this.values[row.propName] = row.value;
      }
      valStmt.free();

      this._renderForm();
    } catch (e) {
      console.error('加载属性值失败:', e);
      contentEl.createEl('p', { text: '加载失败: ' + e.message });
    }
  }

  _findBlockId() {
    let sql, params;
    if (this.lineHint !== null && this.lineHint !== undefined) {
      sql = `SELECT b.id FROM blocks b
             INNER JOIN files f ON b.fileUUID = f.uuid
             INNER JOIN block_tags bt ON bt.blockId = b.id
             WHERE f.path = ? AND bt.tagName = ? AND b.startLine <= ? AND b.endLine >= ?
             LIMIT 1`;
      params = [this.filePath, this.tagName, this.lineHint, this.lineHint];
    } else {
      sql = `SELECT b.id FROM blocks b
             INNER JOIN files f ON b.fileUUID = f.uuid
             INNER JOIN block_tags bt ON bt.blockId = b.id
             WHERE f.path = ? AND bt.tagName = ?
             ORDER BY b.startLine LIMIT 1`;
      params = [this.filePath, this.tagName];
    }
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let blockId = null;
    if (stmt.step()) blockId = stmt.getAsObject().id;
    stmt.free();
    return blockId;
  }

  _renderNoProps() {
    const { contentEl } = this;
    const color = getTagColor(this.tagName);
    const header = contentEl.createDiv({ cls: 'supertag-values-header' });
    const pill = header.createEl('span', { cls: 'supertag-pill supertag-pill-lg' });
    pill.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:${color.text};`;
    pill.createEl('span', { text: '#', cls: 'supertag-pill-hash' });
    pill.createEl('span', { text: this.tagName });

    contentEl.createEl('p', { text: '该标签尚未定义属性字段，请先配置属性。', cls: 'supertag-values-empty' });
    const footer = contentEl.createDiv({ cls: 'supertag-values-footer' });
    footer.createEl('button', { text: '去定义属性', cls: 'mod-cta' }).onclick = () => {
      this.close();
      new SupertagPropertiesModal(this.app, this.plugin, this.tagName).open();
    };
    footer.createEl('button', { text: '关闭' }).onclick = () => this.close();
  }

  _renderForm() {
    const { contentEl } = this;
    contentEl.empty();
    const color = getTagColor(this.tagName);

    // 头部
    const header = contentEl.createDiv({ cls: 'supertag-values-header' });
    const pill = header.createEl('span', { cls: 'supertag-pill supertag-pill-lg' });
    pill.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:${color.text};`;
    pill.createEl('span', { text: '#', cls: 'supertag-pill-hash' });
    pill.createEl('span', { text: this.tagName });
    header.createEl('p', { text: '编辑属性值', cls: 'supertag-values-desc' });

    // 属性表单
    const form = contentEl.createDiv({ cls: 'supertag-values-form' });
    const inputs = {};

    this.properties.forEach(prop => {
      const row = form.createDiv({ cls: 'supertag-values-row' });
      const typeInfo = PROP_TYPE_ICONS[prop.type] || { icon: '?', label: '未知' };

      const iconEl = row.createEl('span', { cls: 'supertag-values-icon' });
      iconEl.innerHTML = typeInfo.icon;
      row.createEl('label', { text: prop.name, cls: 'supertag-values-label' });

      const currentVal = this.values[prop.name] || '';

      switch (prop.type) {
        case 2: { // 数字
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'number'; inp.value = currentVal; inp.placeholder = '输入数字';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 3: { // 图片
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'url'; inp.value = currentVal; inp.placeholder = '图片 URL';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 4: { // 链接
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'url'; inp.value = currentVal; inp.placeholder = '输入链接';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 5: { // 位置
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'text'; inp.value = currentVal; inp.placeholder = '输入位置';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 6: { // 电话
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'tel'; inp.value = currentVal; inp.placeholder = '输入电话号码';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 7: { // 邮箱
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'email'; inp.value = currentVal; inp.placeholder = '输入邮箱';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 8: { // 布尔值
          const cb = row.createEl('input', { cls: 'supertag-values-input' });
          cb.type = 'checkbox'; cb.checked = currentVal === '1' || currentVal === 'true';
          inputs[prop.name] = () => cb.checked ? '1' : '0';
          break;
        }
        case 9: { // 日期
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'date'; inp.value = currentVal;
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 10: { // 时间
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'time'; inp.value = currentVal;
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 11: { // 日期与时间
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'datetime-local'; inp.value = currentVal;
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 12: { // 单选
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'text'; inp.value = currentVal; inp.placeholder = '输入选项';
          inputs[prop.name] = () => inp.value;
          break;
        }
        case 13: { // 多选
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'text'; inp.value = currentVal; inp.placeholder = '多个选项用逗号分隔';
          inputs[prop.name] = () => inp.value;
          break;
        }
        default: { // 文本 (type=1) 或未知
          const inp = row.createEl('input', { cls: 'supertag-values-input' });
          inp.type = 'text'; inp.value = currentVal; inp.placeholder = '输入文本';
          inputs[prop.name] = () => inp.value;
        }
      }
    });

    // 底部按钮
    const footer = contentEl.createDiv({ cls: 'supertag-values-footer' });
    footer.createEl('button', { text: '保存', cls: 'mod-cta' }).onclick = async () => {
      await this._saveValues(inputs);
    };
    footer.createEl('button', { text: '取消' }).onclick = () => this.close();
  }

  async _saveValues(inputs) {
    try {
      this.db.run('BEGIN TRANSACTION');
      try {
        // 先删后插
        this.db.run('DELETE FROM tag_values WHERE blockId = ? AND tagName = ?', [this.blockId, this.tagName]);
        for (const [propName, getter] of Object.entries(inputs)) {
          const value = getter();
          if (value !== '' && value !== null && value !== undefined) {
            this.db.run('INSERT INTO tag_values (blockId, tagName, propName, value) VALUES (?, ?, ?, ?)',
              [this.blockId, this.tagName, propName, value]);
          }
        }
        this.db.run('COMMIT');
      } catch (e) { this.db.run('ROLLBACK'); throw e; }

      const exported = this.db.export();
      await this.plugin.app.vault.adapter.writeBinary(this.plugin.getDbPath(), exported);
      // 通知同步引擎重新加载
      if (this.plugin._syncEngine) await this.plugin._syncEngine.reload();
      new Notice(`"${this.tagName}" 属性值已保存`);
      this.close();
    } catch (e) {
      console.error('保存属性值失败:', e);
      new Notice('保存失败: ' + e.message);
    }
  }

  onClose() {
    this.contentEl.empty();
    if (this.db) this.db.close();
  }
}

// ========== Supertag 查询面板（编辑器底部） ==========
class SupertagQueryPanel {
  constructor(plugin) {
    this.plugin = plugin;
    this.panelEl = null;
    this.contentEl = null;
    this.db = null;
    this.collapsed = false;
    this.viewMode = 'outline'; // 默认使用 outline 模式

    // 查询配置 (Tana 风格)
    this.query = {
      parts: [] // { type: 'tag', value: 'tagName' }
    };
  }

  async attach(viewContentEl) {
    // 如果该容器中已经有了这个面板，直接返回
    if (viewContentEl.contains(this.panelEl)) return;

    // 如果面板已经创建过，直接移动到新容器
    if (this.panelEl) {
      viewContentEl.appendChild(this.panelEl);
      return;
    }

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'supertag-query-panel';

    // 可拖动的分割线手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'supertag-qp-resize-handle';
    resizeHandle.innerHTML = '<div class="supertag-qp-resize-bar"></div>';
    this.panelEl.appendChild(resizeHandle);

    // 拖动逻辑
    let startY = 0, startHeight = 0, isDragging = false;
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      startHeight = this.contentEl.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const delta = startY - e.clientY;
        const newHeight = Math.max(80, Math.min(600, startHeight + delta));
        this.contentEl.style.height = newHeight + 'px';
        this._panelHeight = newHeight;
      };

      const onMouseUp = () => {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // 标题栏
    const header = document.createElement('div');
    header.className = 'supertag-qp-header';
    header.innerHTML = `
      <span class="supertag-qp-arrow">▾</span>
      <span class="supertag-qp-title">Search Node</span>
    `;
    header.addEventListener('click', () => this._toggle());
    this.panelEl.appendChild(header);

    // 可折叠内容区
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'supertag-qp-content';
    if (this._panelHeight) this.contentEl.style.height = this._panelHeight + 'px';
    this.panelEl.appendChild(this.contentEl);

    viewContentEl.appendChild(this.panelEl);

    // 默认展开，自动加载
    if (!this.collapsed) this._loadPanel();
  }

  _toggle() {
    this.collapsed = !this.collapsed;
    const arrow = this.panelEl.querySelector('.supertag-qp-arrow');
    if (this.collapsed) {
      this.contentEl.style.display = 'none';
      arrow.textContent = '▸';
    } else {
      this.contentEl.style.display = 'block';
      arrow.textContent = '▾';
      this._loadPanel();
    }
  }

  async _loadPanel() {
    this.contentEl.innerHTML = '';
    try {
      const SQL = await this.plugin.getSQLEngine();
      const dbPath = this.plugin.getDbPath();
      const exists = await this.plugin.app.vault.adapter.exists(dbPath);
      if (!exists) {
        this.contentEl.innerHTML = '<p class="supertag-qp-empty">数据库尚未同步</p>';
        return;
      }
      const dbData = await this.plugin.app.vault.adapter.readBinary(dbPath);
      if (this.db) this.db.close();
      this.db = new SQL.Database(new Uint8Array(dbData));

      // 1. Tana 风格查询构建器
      const builder = document.createElement('div');
      builder.className = 'supertag-qp-builder';

      const queryLine = document.createElement('div');
      queryLine.className = 'supertag-qp-query-line';

      // 已添加的过滤药丸
      if (this.query.parts.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'supertag-qp-placeholder';
        placeholder.textContent = 'Find nodes where...';
        queryLine.appendChild(placeholder);
      } else {
        this.query.parts.forEach((part, index) => {
          const pill = document.createElement('div');
          pill.className = 'supertag-qp-pill';

          let label = "Has";
          let value = part.valueText || part.value;

          if (part.type === 'tag') { label = "With tag"; value = "#" + part.value; }
          else if (part.type === 'any_tag') { label = "With any tag"; value = ""; }
          else if (part.type === 'text') { label = "With text"; value = `"${part.value}"`; }
          else if (part.type === 'field') { label = "With field"; value = part.value; }
          else if (part.type === 'attachment') { label = "With attachment"; value = ""; }

          pill.innerHTML = `
            <span class="supertag-qp-pill-label">${label}</span>
            ${value ? `<span class="supertag-qp-pill-value">${value}</span>` : ''}
            <span class="supertag-qp-pill-close">✕</span>
          `;
          pill.querySelector('.supertag-qp-pill-close').onclick = (e) => {
            e.stopPropagation();
            this.query.parts.splice(index, 1);
            this._loadPanel();
          };
          queryLine.appendChild(pill);
        });
      }

      // 添加按钮 (+)
      const addBtn = document.createElement('div');
      addBtn.className = 'supertag-qp-add-filter';
      addBtn.textContent = '+';
      addBtn.onclick = (e) => {
        e.stopPropagation();
        this._showFilterMenu(addBtn);
      };
      queryLine.appendChild(addBtn);

      builder.appendChild(queryLine);
      this.contentEl.appendChild(builder);

      // 2. 结果区域
      const resultArea = document.createElement('div');
      resultArea.className = 'supertag-qp-results';
      this.contentEl.appendChild(resultArea);

      if (this.query.parts.length > 0) {
        this._renderResults(resultArea);
      }
    } catch (e) {
      console.error('[QueryPanel] load error:', e);
      this.contentEl.innerHTML = `<p class="supertag-qp-empty">加载失败: ${e.message}</p>`;
    }
  }

  _showFilterMenu(anchor) {
    const menu = document.createElement('div');
    menu.className = 'supertag-qp-menu';
    this._renderFilterMenuBody(menu, anchor);
    this._positionMenu(menu, anchor);
  }

  _renderFilterMenuBody(menu, anchor) {
    menu.innerHTML = '';

    let prefix = "Find nodes";
    const primaryPart = this.query.parts[0];
    if (primaryPart) {
      if (primaryPart.type === 'tag') prefix += ` with tag #${primaryPart.value}`;
      else if (primaryPart.type === 'any_tag') prefix += ` with any tag`;
      else if (primaryPart.type === 'text') prefix += ` with text "${primaryPart.value}"`;
      else if (primaryPart.type === 'field') prefix += ` with field ${primaryPart.value}`;
    }

    // 1. Menu Header (当前查询状态)
    const menuHeader = document.createElement('div');
    menuHeader.className = 'supertag-qp-menu-header';
    menuHeader.textContent = primaryPart ? prefix : 'Find nodes where...';
    menu.appendChild(menuHeader);

    const options = [];

    // 2. 基础过滤 (统一使用 and 前缀)
    const and = this.query.parts.length > 0 ? " and" : "";

    options.push(
      { id: 'tag', label: `${prefix}${and} with tag #`, icon: '🏷️', hasArrow: true },
      { id: 'attachment', label: `${prefix}${and} with attachment`, icon: '🖇️', hasArrow: false },
      { id: 'field', label: `${prefix}${and} with field:`, icon: '📋', hasArrow: true },
      { id: 'text', label: `${prefix}${and} with text: ""`, icon: '🔍', hasArrow: true }
    );

    if (!this.query.parts.some(p => p.type === 'tag' || p.type === 'any_tag')) {
      options.push({ id: 'any_tag', label: 'Find nodes with any tag', icon: '✨', hasArrow: false });
    }

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'supertag-qp-menu-item';
      item.innerHTML = `
        <div class="supertag-qp-menu-item-left">
            <span class="supertag-qp-menu-icon">${opt.icon}</span>
            <span>${opt.label}</span>
        </div>
        ${opt.hasArrow ? '<span class="supertag-qp-menu-arrow">→</span>' : ''}
      `;

      item.onclick = (e) => {
        e.stopPropagation();
        if (opt.id === 'tag') {
          this._showTagSelector(menu, anchor);
        } else if (opt.id === 'field') {
          this._showFieldSelector(menu, anchor);
        } else if (opt.id === 'attachment') {
          this.query.parts.push({ type: 'attachment' });
          this._loadPanel();
          this._renderFilterMenuBody(menu, anchor);
        } else if (opt.id === 'any_tag') {
          this.query.parts.push({ type: 'any_tag' });
          this._loadPanel();
          this._renderFilterMenuBody(menu, anchor);
        } else if (opt.id === 'text') {
          this._showTextInput(menu, anchor, 'text');
        } else {
          menu.remove();
        }
      };
      menu.appendChild(item);
    });
  }

  _showTagSelector(parentMenu, anchor) {
    parentMenu.innerHTML = '<div class="supertag-qp-menu-title">Select Tag</div>';

    const tags = [];
    const tStmt = this.db.prepare('SELECT DISTINCT tagName FROM tag_properties ORDER BY tagName');
    while (tStmt.step()) tags.push(tStmt.getAsObject().tagName);
    tStmt.free();

    if (tags.length === 0) {
      parentMenu.innerHTML += '<div class="supertag-qp-menu-item">No tags found</div>';
    } else {
      tags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'supertag-qp-menu-item';
        item.textContent = '#' + tag;
        item.onclick = (e) => {
          e.stopPropagation();
          this.query.parts.push({ type: 'tag', value: tag });
          this._loadPanel();
          this._renderFilterMenuBody(parentMenu, anchor);
        };
        parentMenu.appendChild(item);
      });
    }
  }

  _showFieldSelector(parentMenu, anchor) {
    parentMenu.innerHTML = '<div class="supertag-qp-menu-title">Select Field</div>';

    const fields = [];
    const fStmt = this.db.prepare('SELECT DISTINCT name FROM tag_properties ORDER BY name');
    while (fStmt.step()) fields.push(fStmt.getAsObject().name);
    fStmt.free();

    fields.forEach(field => {
      const item = document.createElement('div');
      item.className = 'supertag-qp-menu-item';
      item.textContent = field;
      item.onclick = (e) => {
        e.stopPropagation();
        this.query.parts.push({ type: 'field', value: field });
        this._loadPanel();
        this._renderFilterMenuBody(parentMenu, anchor);
      };
      parentMenu.appendChild(item);
    });
  }

  _showTextInput(parentMenu, anchor, type) {
    parentMenu.innerHTML = `<div class="supertag-qp-menu-title">Enter ${type}</div>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'supertag-qp-menu-input';
    input.placeholder = 'Type and press Enter...';
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        this.query.parts.push({ type, value: input.value.trim() });
        this._loadPanel();
        this._renderFilterMenuBody(parentMenu, anchor);
      }
    };
    parentMenu.appendChild(input);
    setTimeout(() => input.focus(), 100);
  }

  _positionMenu(menu, anchor) {
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);

    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);
  }

  _renderResults(container) {
    container.innerHTML = '';
    if (!this.db) return;

    let sql = `
      SELECT DISTINCT f.path, b.id AS blockId, b.startLine, b.content
      FROM blocks b
      INNER JOIN files f ON b.fileUUID = f.uuid
    `;
    const params = [];
    const whereClauses = [];

    // 1. 处理 Tag 过滤
    const tagParts = this.query.parts.filter(p => p.type === 'tag');
    if (tagParts.length > 0) {
      tagParts.forEach((p, i) => {
        const alias = `bt${i}`;
        sql += ` INNER JOIN block_tags ${alias} ON ${alias}.blockId = b.id AND ${alias}.tagName = ?`;
        params.push(p.value);
      });
    }

    // 2. 处理 Any Tag 过滤
    if (this.query.parts.some(p => p.type === 'any_tag')) {
      sql += ` INNER JOIN block_tags bt_any ON bt_any.blockId = b.id`;
    }

    // 3. 处理 Text 过滤
    const textParts = this.query.parts.filter(p => p.type === 'text');
    textParts.forEach(p => {
      whereClauses.push("b.content LIKE ?");
      params.push(`%${p.value}%`);
    });

    // 5. 处理 Attachment 过滤 (查找 Obsidian 的 ![[...]] 嵌入语法)
    if (this.query.parts.some(p => p.type === 'attachment')) {
      whereClauses.push("b.content LIKE '%![[%'");
    }

    // 4. 处理 Field 过滤
    const fieldParts = this.query.parts.filter(p => p.type === 'field');
    fieldParts.forEach(p => {
      whereClauses.push("EXISTS (SELECT 1 FROM tag_values tv WHERE tv.blockId = b.id AND tv.propName = ?)");
      params.push(p.value);
    });

    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    sql += " ORDER BY f.path, b.startLine LIMIT 200";

    const rows = [];
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
    } catch (e) {
      container.innerHTML = `<p class="supertag-qp-empty">查询错误: ${e.message}</p>`;
      return;
    }

    if (rows.length === 0) {
      container.innerHTML = '<p class="supertag-qp-empty">No results found</p>';
      return;
    }

    // 统计
    const countEl = document.createElement('div');
    countEl.className = 'supertag-qp-count';
    countEl.textContent = `Found ${rows.length} nodes`;
    container.appendChild(countEl);

    const list = document.createElement('div');
    list.className = 'supertag-qp-list';
    rows.forEach(row => {
      const item = document.createElement('div');
      item.className = 'supertag-qp-list-item';

      const bullet = document.createElement('span');
      bullet.className = 'supertag-qp-list-bullet';
      bullet.textContent = '•';

      const content = document.createElement('span');
      content.className = 'supertag-qp-list-content';

      // 使用 Obsidian 原生 Markdown 渲染
      const { MarkdownRenderer } = require('obsidian');
      MarkdownRenderer.renderMarkdown(row.content, content, row.path, this.plugin);

      const link = document.createElement('span');
      link.className = 'supertag-qp-list-file';
      link.textContent = ` (${row.path.split('/').pop().replace('.md', '')})`;
      link.onclick = (e) => {
        e.stopPropagation();
        const file = this.plugin.app.vault.getAbstractFileByPath(row.path);
        if (file) this.plugin.app.workspace.getLeaf(false).openFile(file);
      };

      item.appendChild(bullet);
      item.appendChild(content);
      item.appendChild(link);
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  destroy() {
    if (this.db) { this.db.close(); this.db = null; }
    if (this.panelEl) { this.panelEl.remove(); this.panelEl = null; }
  }
}

// ========== Sudoku Management ==========

class SudokuInputDialog extends Modal {
  constructor(app, title, defaultValue, onSave) {
    super(app);
    this.title = title;
    this.value = defaultValue;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.title });

    const inputRow = contentEl.createDiv({ cls: 'sudoku-cell-editor-row' });
    const input = inputRow.createEl('input', { type: 'text', cls: 'sudoku-cell-editor-input' });
    input.value = this.value;
    input.focus();

    // 监听回车键
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.onSave(input.value);
        this.close();
      }
    });

    const btnBar = contentEl.createDiv({ cls: 'supertag-editor-btn-bar' });
    btnBar.createEl('button', { text: '确定', cls: 'mod-cta' }).onclick = () => {
      this.onSave(input.value);
      this.close();
    };
    btnBar.createEl('button', { text: '取消' }).onclick = () => this.close();
  }
}

class SudokuTagModal extends Modal {
  constructor(plugin, name, initialTags, onSave) {
    super(plugin.app);
    this.plugin = plugin;
    this.name = name;
    this.tags = [...initialTags];
    this.onSave = onSave;

    // 获取库中所有标签用于智能匹配
    this.allLibraryTags = this.plugin._syncEngine.getAllUniqueTags() || [];
    this.selectedIndex = -1;
    this.filteredSuggestions = [];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-tag-modal');
    contentEl.createEl('h3', { text: this.name });

    const container = contentEl.createDiv({ cls: 'sudoku-tag-editor-container' });

    const tagList = container.createDiv({ cls: 'sudoku-tag-editor-list' });
    this.renderTags(tagList);

    const inputWrapper = container.createDiv({ cls: 'sudoku-tag-editor-input-wrapper' });
    const input = inputWrapper.createEl('input', {
      type: 'text',
      cls: 'sudoku-tag-editor-input',
      attr: { placeholder: '输入新标签，按回车添加...' }
    });

    const suggestionPanel = inputWrapper.createDiv({ cls: 'sudoku-tag-suggestions' });
    suggestionPanel.style.display = 'none';

    const addTag = (tagName) => {
      const val = tagName || input.value.trim();
      if (val && !this.tags.includes(val)) {
        this.tags.push(val);
        input.value = '';
        this.onSave(this.tags);
        this.renderTags(tagList);
        hideSuggestions();
      }
    };

    const showSuggestions = (query) => {
      if (!query) {
        hideSuggestions();
        return;
      }
      this.filteredSuggestions = this.allLibraryTags.filter(t =>
        t.toLowerCase().includes(query.toLowerCase()) && !this.tags.includes(t)
      );

      if (this.filteredSuggestions.length === 0) {
        hideSuggestions();
        return;
      }

      suggestionPanel.empty();
      suggestionPanel.style.display = 'block';
      this.selectedIndex = 0;

      this.filteredSuggestions.forEach((tag, idx) => {
        const item = suggestionPanel.createDiv({ cls: 'sudoku-tag-suggestion-item' });
        if (idx === 0) item.addClass('is-selected');

        // 添加小图标
        setIcon(item.createSpan({ cls: 'sudoku-tag-suggestion-item-icon' }), 'tag');

        // 智能高亮匹配文字
        const lowerTag = tag.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const startIdx = lowerTag.indexOf(lowerQuery);

        if (startIdx >= 0) {
          const content = item.createSpan({ cls: 'sudoku-tag-suggestion-content' });
          content.createSpan({ text: tag.substring(0, startIdx) });
          content.createSpan({ text: tag.substring(startIdx, startIdx + query.length), cls: 'match' });
          content.createSpan({ text: tag.substring(startIdx + query.length) });
        } else {
          item.createSpan({ text: tag, cls: 'sudoku-tag-suggestion-content' });
        }

        item.onclick = (e) => {
          e.stopPropagation();
          addTag(tag);
          input.focus();
        };
      });
    };

    const hideSuggestions = () => {
      suggestionPanel.style.display = 'none';
      this.selectedIndex = -1;
      this.filteredSuggestions = [];
    };

    input.oninput = () => {
      showSuggestions(input.value.trim());
    };

    input.onkeydown = (e) => {
      if (suggestionPanel.style.display !== 'none') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex + 1) % this.filteredSuggestions.length;
          updateSelection();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex - 1 + this.filteredSuggestions.length) % this.filteredSuggestions.length;
          updateSelection();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.selectedIndex >= 0) {
            addTag(this.filteredSuggestions[this.selectedIndex]);
          } else {
            addTag();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideSuggestions();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      }
    };

    const updateSelection = () => {
      const items = suggestionPanel.querySelectorAll('.sudoku-tag-suggestion-item');
      items.forEach((item, idx) => {
        if (idx === this.selectedIndex) item.addClass('is-selected');
        else item.removeClass('is-selected');
      });
      // 确保选中的项可见
      const selected = items[this.selectedIndex];
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    };

    setTimeout(() => input.focus(), 100);
  }

  renderTags(container) {
    container.empty();
    if (this.tags.length === 0) {
      container.createDiv({ text: '暂无标签', cls: 'sudoku-tag-editor-empty' });
      return;
    }
    this.tags.forEach((tag, index) => {
      const color = getTagColor(tag);
      const pill = container.createSpan({ cls: 'sudoku-tag-pill' });
      pill.style.backgroundColor = color.bg;
      pill.style.color = color.text;
      pill.style.borderColor = color.border;

      pill.createSpan({ text: tag });
      const removeBtn = pill.createSpan({ cls: 'sudoku-tag-pill-unpin' });
      setIcon(removeBtn, 'x');
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.tags.splice(index, 1);
        this.onSave(this.tags);
        this.renderTags(container);
      };
    });
  }
}

class SudokuIconPickerModal extends Modal {
  constructor(plugin, sudoku, onSave) {
    super(plugin.app);
    this.plugin = plugin;
    this.sudoku = sudoku;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-icon-picker-modal');
    contentEl.createEl('h3', { text: `选择图标: ${this.sudoku.name}` });

    const iconSearch = contentEl.createEl('input', {
      cls: 'sudoku-icon-search',
      attr: { type: 'text', placeholder: '搜索图标...' }
    });

    const iconGrid = contentEl.createDiv({ cls: 'sudoku-icon-grid' });
    const allIcons = [
      'star', 'heart', 'zap', 'target', 'book', 'lightbulb', 'calendar', 'clock',
      'coffee', 'home', 'user', 'mail', 'link', 'image', 'video', 'music',
      'file-text', 'folder', 'archive', 'bookmark', 'tag', 'flag', 'pin',
      'pencil', 'trash-2', 'settings', 'search', 'bell', 'check-circle',
      'alert-circle', 'help-circle', 'info', 'smile', 'layout-grid', 'layout-list',
      'kanban', 'git-branch', 'database', 'cloud', 'cpu', 'terminal', 'flask-conical',
      'graduation-cap', 'briefcase', 'shopping-cart', 'credit-card', 'activity',
      'sun', 'moon', 'wind', 'umbrella', 'anchor', 'bike', 'car', 'plane'
    ];

    const renderIcons = (filter = '') => {
      iconGrid.empty();
      const currentIcon = this.sudoku.icon;
      let iconsToShow = allIcons.filter(name => name.includes(filter.toLowerCase()));
      const isCurrentIconSvg = currentIcon && currentIcon.trim().startsWith('<svg');
      if (currentIcon && !isCurrentIconSvg && !iconsToShow.includes(currentIcon) && currentIcon.includes(filter.toLowerCase())) {
        iconsToShow.unshift(currentIcon);
      }

      iconsToShow.forEach(name => {
        const item = iconGrid.createDiv({
          cls: `sudoku-icon-item ${this.sudoku.icon === name ? 'is-active' : ''}`,
          attr: { 'aria-label': name }
        });
        setIcon(item, name);
        item.onclick = () => {
          const isSelected = this.sudoku.icon === name;
          this.onSave(isSelected ? null : name);
          this.close();
        };
      });
      if (iconsToShow.length === 0) {
        iconGrid.createDiv({ text: '未找到图标', cls: 'sudoku-icon-empty' });
      }
    };

    iconSearch.oninput = () => renderIcons(iconSearch.value);
    renderIcons();

    const customIconGroup = contentEl.createDiv({ cls: 'sudoku-custom-icon-row' });
    const customInput = customIconGroup.createEl('textarea', {
      cls: 'sudoku-icon-custom-textarea',
      attr: { placeholder: '在此粘贴 <svg> 图标代码...' }
    });
    const isSvg = this.sudoku.icon && this.sudoku.icon.trim().startsWith('<svg');
    customInput.value = isSvg ? this.sudoku.icon : '';

    const applyBtn = customIconGroup.createEl('button', { text: '应用自定义', cls: 'mod-cta' });
    applyBtn.onclick = () => {
      const val = customInput.value.trim();
      this.onSave(val || null);
      this.close();
    };

    const clearBtn = customIconGroup.createEl('button', { text: '清除', cls: 'sudoku-icon-clear-btn' });
    clearBtn.onclick = () => {
      this.onSave(null);
      this.close();
    };

    iconSearch.focus();
  }
}

class SudokuVisualSettingsModal extends Modal {
  constructor(plugin, sudoku, onSave) {
    super(plugin.app);
    this.plugin = plugin;
    this.sudoku = sudoku;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-settings-modal');
    contentEl.createEl('h3', { text: `设置: ${this.sudoku.name}` });

    const container = contentEl.createDiv({ cls: 'sudoku-settings-container' });

    // 主题色选择
    const colorGroup = container.createDiv({ cls: 'sudoku-setting-group' });
    colorGroup.createEl('label', { text: '主题色' });
    const colorRow = colorGroup.createDiv({ cls: 'sudoku-color-row' });
    const colors = ['#7c4dff', '#ff5252', '#40c4ff', '#4caf50', '#ffab40', '#795548', '#607d8b'];

    colors.forEach(c => {
      const swatch = colorRow.createDiv({ cls: `sudoku-color-swatch ${this.sudoku.theme_color === c ? 'is-active' : ''}` });
      swatch.style.backgroundColor = c;
      swatch.onclick = () => {
        colorRow.querySelectorAll('.sudoku-color-swatch').forEach(s => s.removeClass('is-active'));
        swatch.addClass('is-active');
        this.sudoku.theme_color = c;
      };
    });

    // 清除颜色按钮
    const clearBtn = colorRow.createEl('button', { text: '清除', cls: 'sudoku-color-clear' });
    clearBtn.onclick = () => {
      colorRow.querySelectorAll('.sudoku-color-swatch').forEach(s => s.removeClass('is-active'));
      this.sudoku.theme_color = null;
    };

    // 模板设置
    const templateGroup = container.createDiv({ cls: 'sudoku-setting-group inline' });
    templateGroup.createEl('label', { text: '设为模板' });
    const templateCheck = templateGroup.createEl('input', { attr: { type: 'checkbox' } });
    templateCheck.checked = !!this.sudoku.is_template;
    templateCheck.onchange = () => this.sudoku.is_template = templateCheck.checked;

    const btnBar = contentEl.createDiv({ cls: 'sudoku-settings-btn-bar' });
    const saveBtn = btnBar.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = () => {
      this.onSave({
        theme_color: this.sudoku.theme_color,
        is_template: this.sudoku.is_template
      });
      this.close();
    };
    btnBar.createEl('button', { text: '取消' }).onclick = () => this.close();
  }
}

class SudokuTemplateSelectModal extends Modal {
  constructor(plugin, templates, onSelect) {
    super(plugin.app);
    this.plugin = plugin;
    this.templates = templates;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-template-select-modal');
    contentEl.createEl('h3', { text: '选择模板或开新篇' });

    const list = contentEl.createDiv({ cls: 'sudoku-template-list' });

    // 默认空白模板
    const blankItem = list.createDiv({ cls: 'sudoku-template-item' });
    const blankIcon = blankItem.createDiv({ cls: 'sudoku-template-icon-wrap' });
    setIcon(blankIcon, 'plus');
    blankItem.createDiv({ text: '空白九宫格', cls: 'sudoku-template-name' });
    blankItem.onclick = () => { this.onSelect(null); this.close(); };

    this.templates.forEach(t => {
      const item = list.createDiv({ cls: 'sudoku-template-item' });
      const iconWrap = item.createDiv({ cls: 'sudoku-template-icon-wrap' });
      setIcon(iconWrap, t.icon || 'layout-grid');
      if (t.theme_color) iconWrap.style.color = t.theme_color;

      item.createDiv({ text: t.name, cls: 'sudoku-template-name' });
      item.onclick = () => { this.onSelect(t); this.close(); };
    });
  }
}

class SudokuDeleteConfirmModal extends Modal {
  constructor(app, sudokuName, onConfirm) {
    super(app);
    this.sudokuName = sudokuName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: '确认删除' });
    contentEl.createEl('p', { text: `确定要删除 "${this.sudokuName}" 吗？此操作不可撤销。` });

    const btnBar = contentEl.createDiv({ cls: 'supertag-editor-btn-bar' });
    const confirmBtn = btnBar.createEl('button', { text: '删除', cls: 'mod-warning' });
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
    btnBar.createEl('button', { text: '取消' }).onclick = () => this.close();
  }
}

class SudokuFolderDeleteConfirmModal extends Modal {
  constructor(app, folderName, onConfirm) {
    super(app);
    this.folderName = folderName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: '确认删除文件夹' });
    contentEl.createEl('p', { text: `确定要删除文件夹 "${this.folderName}" 吗？其中的九宫格将被移到"未分类"` });

    const btnBar = contentEl.createDiv({ cls: 'supertag-editor-btn-bar' });
    const confirmBtn = btnBar.createEl('button', { text: '删除', cls: 'mod-warning' });
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
    btnBar.createEl('button', { text: '取消' }).onclick = () => this.close();
  }
}

class SudokuMgmtView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.viewMode = 'grid'; // 'grid' or 'list'
    this.currentFolderId = null;
    this.activeTags = new Set();
  }

  getViewType() { return SUDOKU_MGMT_VIEW_TYPE; }
  getDisplayText() { return '九宫格管理面板'; }
  getIcon() { return 'layout-grid'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-mgmt-view');
    await this._render();
  }

  async _render() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: 'sudoku-mgmt-header' });

    // 左侧：标题和统计信息
    const leftHeader = header.createDiv({ cls: 'sudoku-mgmt-header-left' });
    const titleGroup = leftHeader.createDiv({ cls: 'sudoku-mgmt-title-group' });
    titleGroup.createEl('h2', { text: '我的九宫格', cls: 'sudoku-mgmt-title' });
    const stats = titleGroup.createDiv({ cls: 'sudoku-mgmt-stats' });

    // 中间：搜索框
    const centerHeader = header.createDiv({ cls: 'sudoku-mgmt-header-center' });
    const searchWrapper = centerHeader.createDiv({ cls: 'sudoku-search-wrapper' });
    setIcon(searchWrapper.createDiv({ cls: 'sudoku-search-icon' }), 'search');
    const searchInput = searchWrapper.createEl('input', {
      cls: 'sudoku-search-input',
      attr: { placeholder: '搜索九宫格...' }
    });



    // 右侧：操作区
    const rightHeader = header.createDiv({ cls: 'sudoku-mgmt-header-right' });

    // 视图切换按钮
    const modeToggle = rightHeader.createDiv({ cls: 'sudoku-mode-toggle' });
    const gridBtn = modeToggle.createEl('button', {
      cls: `sudoku-mode-btn ${this.viewMode === 'grid' ? 'is-active' : ''}`,
      attr: { 'aria-label': '网格视图' }
    });
    setIcon(gridBtn, 'layout-grid');
    gridBtn.onclick = () => { this.viewMode = 'grid'; this._render(); };

    const listBtn = modeToggle.createEl('button', {
      cls: `sudoku-mode-btn ${this.viewMode === 'list' ? 'is-active' : ''}`,
      attr: { 'aria-label': '列表视图' }
    });
    setIcon(listBtn, 'list');
    listBtn.onclick = () => { this.viewMode = 'list'; this._render(); };

    const createFolderBtn = rightHeader.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '新建文件夹' } });
    setIcon(createFolderBtn, 'folder-plus');
    createFolderBtn.onclick = () => this._createFolder();

    const createBtn = rightHeader.createEl('button', { cls: 'sudoku-create-btn mod-cta' });
    setIcon(createBtn.createDiv({ cls: 'sudoku-create-icon' }), 'plus');
    createBtn.createEl('span', { text: '新建' });
    createBtn.onclick = () => this._createNew();

    const jgFolder = `${this.plugin.manifest.dir}/.jg`;
    const adapter = this.app.vault.adapter;

    if (!(await adapter.exists(jgFolder))) {
      await adapter.mkdir(jgFolder);
    }

    const initialFilter = searchInput.value.toLowerCase();
    searchInput.oninput = () => {
      this._renderItems(searchInput.value.toLowerCase());
    };

    // 初始渲染时更新统计
    const initialList = this.plugin._syncEngine.getSudokus(initialFilter);
    stats.setText(`${initialList.length} 个项目`);

    this._renderItems(initialFilter);
  }

  async _renderItems(filterValue = '') {
    const { contentEl } = this;
    contentEl.findAll('.sudoku-mgmt-body').forEach(el => el.remove());

    const bodyContainer = contentEl.createDiv({ cls: 'sudoku-mgmt-body' });

    if (!this.plugin._syncEngine) {
      const loading = bodyContainer.createDiv({ cls: 'sudoku-empty-container' });
      const spinner = loading.createDiv({ cls: 'sudoku-loading-spinner' });
      setIcon(spinner, 'refresh-cw');
      loading.createEl('p', { text: '正在初始化同步引擎...' });
      return;
    }

    let sudokuList = this.plugin._syncEngine.getSudokus(filterValue);
    const folders = this.plugin._syncEngine.getFolders();
    const allTagsMap = this.plugin._syncEngine.getSudokuTags();

    if (this.activeTags.size > 0) {
      sudokuList = sudokuList.filter(s => {
        const itemTags = allTagsMap[s.uuid] || [];
        return Array.from(this.activeTags).every(t => itemTags.includes(t));
      });
    }

    // 检查 currentFolderId 是否仍然有效
    if (this.currentFolderId !== null && !folders.find(f => f.uuid === this.currentFolderId)) {
      this.currentFolderId = null;
    }

    const isGlobalSearch = filterValue.trim().length > 0;

    // 更新统计文字
    const headerStats = this.contentEl.querySelector('.sudoku-mgmt-stats');
    if (headerStats) {
      headerStats.textContent = isGlobalSearch
        ? `找到 ${sudokuList.length} 个结果`
        : `${sudokuList.length} 个项目 / ${folders.length} 个目录`;
    }

    // 面包屑导航栏
    if (this.currentFolderId !== null && !isGlobalSearch) {
      const folder = folders.find(f => f.uuid === this.currentFolderId);
      const breadcrumb = bodyContainer.createDiv({ cls: 'sudoku-breadcrumb' });
      const backBtn = breadcrumb.createEl('button', { cls: 'sudoku-breadcrumb-btn' });
      setIcon(backBtn, 'arrow-left');
      backBtn.createSpan({ text: '返回顶层' });

      const sep = breadcrumb.createSpan({ cls: 'sudoku-breadcrumb-sep', text: '/' });
      const iconWrap = breadcrumb.createSpan({ cls: 'sudoku-breadcrumb-icon' });
      setIcon(iconWrap, 'folder');
      breadcrumb.createSpan({ text: folder ? folder.name : '', cls: 'sudoku-breadcrumb-text' });

      backBtn.onclick = () => {
        this.currentFolderId = null;
        this._renderItems(filterValue);
      };

      // 允许拖拽九宫格到面包屑以返回根目录
      breadcrumb.addEventListener('dragover', (e) => { e.preventDefault(); breadcrumb.addClass('drag-over'); });
      breadcrumb.addEventListener('dragleave', () => breadcrumb.removeClass('drag-over'));
      breadcrumb.addEventListener('drop', (e) => {
        e.preventDefault();
        breadcrumb.removeClass('drag-over');
        const sudokuUuid = e.dataTransfer.getData('text/plain');
        if (sudokuUuid) {
          this.plugin._syncEngine.moveToFolder(sudokuUuid, null);
          this._renderItems(filterValue);
        }
      });
    }

    // --- 固定在面板上的常用标签 ---
    const pinnedTags = this.plugin._syncEngine.getPinnedTags();
    if (this.currentFolderId === null && !isGlobalSearch && pinnedTags.length > 0) {
      const tagBanner = bodyContainer.createDiv({ cls: 'sudoku-tags-banner', attr: { 'title': '双击编辑固定标签' } });
      tagBanner.ondblclick = () => this._openPinnedTagsEditor();

      const tagIconWrap = tagBanner.createDiv({ cls: 'sudoku-tags-icon' });
      setIcon(tagIconWrap, 'pin');
      const tagList = tagBanner.createDiv({ cls: 'sudoku-tag-list' });
      pinnedTags.forEach(tag => {
        const isActive = this.activeTags.has(tag);
        const color = getTagColor(tag);
        const pill = tagList.createSpan({ cls: `sudoku-tag-pill ${isActive ? 'is-active' : ''}` });

        // 应用色彩
        if (!isActive) {
          pill.style.backgroundColor = color.bg;
          pill.style.borderColor = color.border;
          pill.style.color = color.text;
        } else {
          pill.style.backgroundColor = color.text;
          pill.style.borderColor = color.text;
          pill.style.color = '#fff';
        }

        pill.createSpan({ text: tag });

        // 允许直接在面板上取消固定
        const unpinBtn = pill.createSpan({ cls: 'sudoku-tag-pill-unpin', attr: { 'aria-label': '取消固定' } });
        setIcon(unpinBtn, 'x');
        unpinBtn.onclick = (e) => {
          e.stopPropagation();
          this.plugin._syncEngine.unpinTag(tag);
          this._renderItems(filterValue);
        };

        pill.onclick = () => {
          if (isActive) this.activeTags.delete(tag);
          else this.activeTags.add(tag);

          const searchInput = this.contentEl.querySelector('.sudoku-search-input');
          this._renderItems(searchInput?.value.toLowerCase() || '');
        };
      });
    }

    // --- 最近访问 ---
    if (this.currentFolderId === null && !isGlobalSearch && this.activeTags.size === 0) {
      const recentSudokus = this.plugin._syncEngine.getRecentAccess(5);
      if (recentSudokus.length > 0) {
        const recentSection = bodyContainer.createDiv({ cls: 'sudoku-recent-section' });
        const recentTitle = recentSection.createDiv({ cls: 'sudoku-recent-title' });
        setIcon(recentTitle.createSpan(), 'history');
        recentTitle.createSpan({ text: '最近访问' });

        const recentList = recentSection.createDiv({ cls: 'sudoku-recent-list' });
        recentSudokus.forEach(s => {
          const ritem = recentList.createDiv({ cls: 'sudoku-recent-item' });
          setIcon(ritem.createDiv({ cls: 'sudoku-recent-icon' }), 'layout-grid');
          ritem.createDiv({ text: s.name, cls: 'sudoku-recent-name' });
          ritem.onclick = () => {
            if (this.plugin._syncEngine) this.plugin._syncEngine.logAccess(s.uuid);
            this.plugin.openSudokuView(`${this.plugin.manifest.dir}/.jg/${s.uuid}.jg`);
          };
        });
      }
    }

    const listContainer = bodyContainer.createDiv({
      cls: `sudoku-container ${this.viewMode === 'grid' ? 'grid-view' : 'list-view'}`
    });

    let itemsToRender = [];
    let foldersToRender = [];

    if (isGlobalSearch) {
      itemsToRender = sudokuList;
    } else {
      if (this.currentFolderId === null) {
        foldersToRender = folders;
        itemsToRender = sudokuList.filter(s => s.folder_uuid === null);
      } else {
        itemsToRender = sudokuList.filter(s => s.folder_uuid === this.currentFolderId);
      }
    }

    if (itemsToRender.length === 0 && foldersToRender.length === 0) {
      const empty = listContainer.createDiv({ cls: 'sudoku-empty-container' });
      if (isGlobalSearch) {
        setIcon(empty.createDiv(), 'search-x');
        empty.createEl('p', { text: '没有找到匹配的九宫格。' });
      } else {
        setIcon(empty.createDiv(), 'folder-open');
        empty.createEl('p', { text: '这里空空如也，点击右上角新建吧。' });
      }
      return;
    }

    // 渲染文件夹卡片
    for (const folder of foldersToRender) {
      const folderCard = listContainer.createDiv({
        cls: `sudoku-item folder-card ${this.viewMode === 'grid' ? 'grid-style' : 'list-style'}`
      });

      folderCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        folderCard.addClass('drag-over');
      });
      folderCard.addEventListener('dragleave', () => {
        folderCard.removeClass('drag-over');
      });
      folderCard.addEventListener('drop', (e) => {
        e.preventDefault();
        folderCard.removeClass('drag-over');
        const sudokuUuid = e.dataTransfer.getData('text/plain');
        if (sudokuUuid) {
          this.plugin._syncEngine.moveToFolder(sudokuUuid, folder.uuid);
          this._renderItems(filterValue);
        }
      });

      const preview = folderCard.createDiv({ cls: 'sudoku-item-preview folder-preview' });
      setIcon(preview, 'folder');

      const info = folderCard.createDiv({ cls: 'sudoku-item-info' });
      info.createDiv({ text: folder.name, cls: 'sudoku-item-name' });

      const itemCount = sudokuList.filter(s => s.folder_uuid === folder.uuid).length;
      const meta = info.createDiv({ cls: 'sudoku-item-meta' });
      meta.createEl('span', { text: `${itemCount} 个项目`, cls: 'sudoku-item-date' });

      const actions = folderCard.createDiv({ cls: 'sudoku-item-actions' });
      const renameBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '改名' } });
      setIcon(renameBtn, 'pencil');
      renameBtn.onclick = (e) => { e.stopPropagation(); this._renameFolder(folder.uuid, folder.name); };

      const deleteBtn = actions.createEl('button', { cls: 'sudoku-action-btn del', attr: { 'aria-label': '删除' } });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.onclick = (e) => { e.stopPropagation(); this._deleteFolder(folder.uuid, folder.name); };

      folderCard.onclick = () => {
        this.currentFolderId = folder.uuid;
        this.searchInputValue = '';
        if (this.contentEl.querySelector('.sudoku-search-input')) {
          this.contentEl.querySelector('.sudoku-search-input').value = '';
        }
        this._renderItems();
      };
    }

    // 渲染九宫格项目
    const jgFolder = `${this.plugin.manifest.dir}/.jg`;
    for (const sudoku of itemsToRender) {
      const fileName = `${sudoku.uuid}.jg`;
      const filePath = `${jgFolder}/${fileName}`;
      try {
        const content = await this.app.vault.adapter.read(filePath);
        const parsed = JSON.parse(content);
        let itemEl;
        const itemTags = allTagsMap[sudoku.uuid] || [];
        if (this.viewMode === 'grid') {
          itemEl = this._renderGridItem(listContainer, parsed, filePath, fileName, sudoku, itemTags);
        } else {
          itemEl = this._renderListItem(listContainer, parsed, filePath, fileName, sudoku, itemTags);
        }

        itemEl.setAttribute('draggable', 'true');
        itemEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', sudoku.uuid);
          e.dataTransfer.effectAllowed = 'move';
          itemEl.style.opacity = '0.4';
        });
        itemEl.addEventListener('dragend', () => {
          itemEl.style.opacity = '1';
        });

      } catch (e) {
        console.error('Failed to render sudoku item:', sudoku.uuid, e);
      }
    }
  }

  _renderGridItem(container, data, filePath, fileName, sudoku = null, tags = []) {
    const item = container.createDiv({
      cls: `sudoku-item grid-style ${sudoku?.is_pinned ? 'is-pinned' : ''} ${sudoku?.is_template ? 'is-template-card' : ''}`
    });

    if (sudoku?.theme_color) {
      item.style.borderColor = sudoku.theme_color;
      const colorBar = item.createDiv({ cls: 'sudoku-item-color-bar' });
      colorBar.style.backgroundColor = sudoku.theme_color;
    }

    // 置顶星星按钮
    const pinBtn = item.createDiv({
      cls: `sudoku-item-pin ${sudoku?.is_pinned ? 'is-active' : ''}`,
      attr: { 'aria-label': sudoku?.is_pinned ? '取消置顶' : '置顶' }
    });
    setIcon(pinBtn, 'star');
    pinBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.plugin._syncEngine && sudoku) {
        this.plugin._syncEngine.togglePin(sudoku.uuid);
        this._render();
      }
    };

    // 九宫格缩略预览
    const preview = item.createDiv({ cls: 'sudoku-item-preview' });
    for (let i = 0; i < 9; i++) {
      const cell = data.cells[i];
      const cellPreview = preview.createDiv({ cls: 'sudoku-preview-cell' });
      if (cell) {
        if (cell.mode === 'query') {
          cellPreview.addClass('is-query');
          setIcon(cellPreview, 'search');
        } else if (cell.name) {
          cellPreview.addClass('has-content');
          cellPreview.createDiv({
            text: cell.name.substring(0, 12),
            cls: 'sudoku-preview-text'
          });
        }
      }
    }

    const info = item.createDiv({ cls: 'sudoku-item-info' });
    const nameWrap = info.createDiv({ cls: 'sudoku-item-name-wrap' });

    // 点击图标直接修改图标
    const iconSpan = nameWrap.createSpan({
      cls: `sudoku-item-custom-icon ${!sudoku?.icon ? 'is-empty' : ''}`,
      attr: { 'aria-label': '更改图标' }
    });

    const renderIcon = (el, icon) => {
      el.empty();
      if (!icon) {
        setIcon(el, 'layout-grid');
      } else if (icon.trim().startsWith('<svg')) {
        el.innerHTML = icon;
      } else {
        setIcon(el, icon);
      }
    };

    renderIcon(iconSpan, sudoku?.icon);
    iconSpan.onclick = (e) => {
      e.stopPropagation();
      new SudokuIconPickerModal(this.plugin, sudoku, (newIcon) => {
        this.plugin._syncEngine.setIcon(sudoku.uuid, newIcon);
        this._render();
      }).open();
    };
    nameWrap.createSpan({ text: data.name || fileName, cls: 'sudoku-item-name' });
    if (sudoku?.is_template) nameWrap.createSpan({ text: '模板', cls: 'sudoku-template-badge' });

    if (tags.length > 0) {
      const tagsContainer = info.createDiv({ cls: 'sudoku-item-tags' });
      tags.forEach(t => {
        const isActive = this.activeTags.has(t);
        const color = getTagColor(t);
        const tagWrap = tagsContainer.createSpan({ cls: `sudoku-item-tag ${isActive ? 'is-active' : ''}` });

        if (!isActive) {
          tagWrap.style.backgroundColor = color.bg;
          tagWrap.style.color = color.text;
        } else {
          tagWrap.style.backgroundColor = color.text;
          tagWrap.style.color = '#fff';
        }

        setIcon(tagWrap.createSpan({ cls: 'sudoku-item-tag-icon' }), 'tag');
        tagWrap.createSpan({ text: t });

        // 悬浮显示的删除按钮
        const removeIconWrap = tagWrap.createSpan({ cls: 'sudoku-item-tag-remove', attr: { 'aria-label': '移除标签' } });
        setIcon(removeIconWrap, 'x');
        removeIconWrap.onclick = (e) => {
          e.stopPropagation();
          const newTags = tags.filter(tag => tag !== t);
          this.plugin._syncEngine.setSudokuTags(sudoku.uuid, newTags);
          this._renderItems(this.contentEl.querySelector('.sudoku-search-input')?.value || '');
        };

        tagWrap.onclick = (e) => {
          e.stopPropagation();
          if (this.activeTags.has(t)) this.activeTags.delete(t);
          else this.activeTags.add(t);

          const searchInput = this.contentEl.querySelector('.sudoku-search-input');
          this._renderItems(searchInput?.value.toLowerCase() || '');
        };

        // 右键固定标签
        tagWrap.oncontextmenu = (e) => {
          this._onTagContextMenu(e, t);
        };
      });
    }

    const meta = info.createDiv({ cls: 'sudoku-item-meta' });
    const createTime = sudoku?.created_at
      ? new Date(sudoku.created_at * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : '未知时间';

    meta.createEl('span', { text: createTime, cls: 'sudoku-item-date' });

    const hasContentCount = data.cells.filter(c => c && ((c.name && c.name.trim() !== '') || (c.content && c.content.trim() !== '') || c.mode === 'query')).length;
    meta.createEl('span', { text: `${hasContentCount}/9`, cls: 'sudoku-item-progress', attr: { 'aria-label': '已填格子计数' } });

    const actions = item.createDiv({ cls: 'sudoku-item-actions' });
    const tagBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '标签' } });
    setIcon(tagBtn, 'tag');
    tagBtn.onclick = (e) => { e.stopPropagation(); this._editTags(sudoku.uuid, data.name); };

    const renameBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '改名' } });
    setIcon(renameBtn, 'pencil');
    renameBtn.onclick = (e) => { e.stopPropagation(); this._rename(filePath, data); };

    const deleteBtn = actions.createEl('button', { cls: 'sudoku-action-btn del', attr: { 'aria-label': '删除' } });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.onclick = (e) => { e.stopPropagation(); this._delete(filePath, data.name); };

    const settingsBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '视觉设置' } });
    setIcon(settingsBtn, 'settings');
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      new SudokuVisualSettingsModal(this.plugin, sudoku, (vals) => {
        this.plugin._syncEngine.setThemeColor(sudoku.uuid, vals.theme_color);
        this.plugin._syncEngine.setAsTemplate(sudoku.uuid, vals.is_template);
        this._render();
      }).open();
    };

    item.onclick = () => {
      if (this.plugin._syncEngine) this.plugin._syncEngine.logAccess(sudoku.uuid);
      this.plugin.openSudokuView(filePath);
    };
    return item;
  }

  _renderListItem(container, data, filePath, fileName, sudoku = null, tags = []) {
    const item = container.createDiv({
      cls: `sudoku-item list-style ${sudoku?.is_pinned ? 'is-pinned' : ''} ${sudoku?.is_template ? 'is-template-card' : ''}`
    });

    if (sudoku?.theme_color) {
      item.style.borderLeftColor = sudoku.theme_color;
      item.style.borderLeftWidth = '4px';
    }

    // 置顶星星按钮（列表模式显示在最左侧）
    const pinBtn = item.createDiv({
      cls: `sudoku-item-pin ${sudoku?.is_pinned ? 'is-active' : ''}`,
      attr: { 'aria-label': sudoku?.is_pinned ? '取消置顶' : '置顶' }
    });
    setIcon(pinBtn, 'star');
    pinBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.plugin._syncEngine && sudoku) {
        this.plugin._syncEngine.togglePin(sudoku.uuid);
        this._render();
      }
    };

    // 小型网格指示器
    const indicator = item.createDiv({ cls: 'sudoku-list-indicator' });
    for (let i = 0; i < 9; i++) {
      const cell = data.cells[i];
      const dot = indicator.createDiv({ cls: 'sudoku-list-dot' });
      if (cell && cell.content) {
        dot.addClass('has-content');
        if (cell.mode === 'query') dot.addClass('is-query');
      }
    }

    const info = item.createDiv({ cls: 'sudoku-item-info' });
    const nameWrap = info.createDiv({ cls: 'sudoku-item-name-wrap' });

    const iconSpan = nameWrap.createSpan({
      cls: `sudoku-item-custom-icon ${!sudoku?.icon ? 'is-empty' : ''}`,
      attr: { 'aria-label': '更改图标' }
    });
    const renderIcon = (el, icon) => {
      el.empty();
      if (!icon) {
        setIcon(el, 'layout-grid');
      } else if (icon.trim().startsWith('<svg')) {
        el.innerHTML = icon;
      } else {
        setIcon(el, icon);
      }
    };

    renderIcon(iconSpan, sudoku?.icon);
    iconSpan.onclick = (e) => {
      e.stopPropagation();
      new SudokuIconPickerModal(this.plugin, sudoku, (newIcon) => {
        this.plugin._syncEngine.setIcon(sudoku.uuid, newIcon);
        this._render();
      }).open();
    };
    nameWrap.createSpan({ text: data.name || fileName, cls: 'sudoku-item-name' });
    if (sudoku?.is_template) nameWrap.createSpan({ text: '模板', cls: 'sudoku-template-badge' });

    if (tags.length > 0) {
      const tagsContainer = info.createDiv({ cls: 'sudoku-item-tags' });
      tags.forEach(t => {
        const isActive = this.activeTags.has(t);
        const color = getTagColor(t);
        const tagWrap = tagsContainer.createSpan({ cls: `sudoku-item-tag ${isActive ? 'is-active' : ''}` });

        if (!isActive) {
          tagWrap.style.backgroundColor = color.bg;
          tagWrap.style.color = color.text;
        } else {
          tagWrap.style.backgroundColor = color.text;
          tagWrap.style.color = '#fff';
        }

        setIcon(tagWrap.createSpan({ cls: 'sudoku-item-tag-icon' }), 'tag');
        tagWrap.createSpan({ text: t });

        // 悬浮显示的删除按钮
        const removeIconWrap = tagWrap.createSpan({ cls: 'sudoku-item-tag-remove', attr: { 'aria-label': '移除标签' } });
        setIcon(removeIconWrap, 'x');
        removeIconWrap.onclick = (e) => {
          e.stopPropagation();
          const newTags = tags.filter(tag => tag !== t);
          this.plugin._syncEngine.setSudokuTags(sudoku.uuid, newTags);
          this._renderItems(this.contentEl.querySelector('.sudoku-search-input')?.value || '');
        };

        tagWrap.onclick = (e) => {
          e.stopPropagation();
          if (this.activeTags.has(t)) this.activeTags.delete(t);
          else this.activeTags.add(t);

          const searchInput = this.contentEl.querySelector('.sudoku-search-input');
          this._renderItems(searchInput?.value.toLowerCase() || '');
        };

        // 右键固定标签
        tagWrap.oncontextmenu = (e) => {
          this._onTagContextMenu(e, t);
        };
      });
    }

    const meta = info.createDiv({ cls: 'sudoku-item-meta' });
    meta.createEl('span', { text: `v${data.version || 1}`, cls: 'sudoku-meta-badge' });
    const hasContentCount = data.cells.filter(c => c && ((c.name && c.name.trim() !== '') || (c.content && c.content.trim() !== '') || c.mode === 'query')).length;
    meta.createEl('span', { text: `${hasContentCount}/9 格`, cls: 'sudoku-item-progress' });

    const actions = item.createDiv({ cls: 'sudoku-item-actions' });
    const tagBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '标签' } });
    setIcon(tagBtn, 'tag');
    tagBtn.onclick = (e) => { e.stopPropagation(); this._editTags(sudoku.uuid, data.name); };

    const renameBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '改名' } });
    setIcon(renameBtn, 'pencil');
    renameBtn.onclick = (e) => { e.stopPropagation(); this._rename(filePath, data); };

    const deleteBtn = actions.createEl('button', { cls: 'sudoku-action-btn del', attr: { 'aria-label': '删除' } });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.onclick = (e) => { e.stopPropagation(); this._delete(filePath, data.name); };

    const settingsBtn = actions.createEl('button', { cls: 'sudoku-action-btn', attr: { 'aria-label': '视觉设置' } });
    setIcon(settingsBtn, 'settings');
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      new SudokuVisualSettingsModal(this.plugin, sudoku, (vals) => {
        this.plugin._syncEngine.setThemeColor(sudoku.uuid, vals.theme_color);
        this.plugin._syncEngine.setIcon(sudoku.uuid, vals.icon);
        this.plugin._syncEngine.setAsTemplate(sudoku.uuid, vals.is_template);
        this._render();
      }).open();
    };

    item.onclick = () => {
      if (this.plugin._syncEngine) this.plugin._syncEngine.logAccess(sudoku.uuid);
      this.plugin.openSudokuView(filePath);
    };
    return item;
  }

  _editTags(uuid, name) {
    const currentTags = this.plugin._syncEngine.getSudokuTags()[uuid] || [];
    new SudokuTagModal(this.plugin, `为 ${name} 打标签`, currentTags, (tagsArray) => {
      this.plugin._syncEngine.setSudokuTags(uuid, tagsArray);
      this._renderItems(this.contentEl.querySelector('.sudoku-search-input')?.value || '');
    }).open();
  }

  _openPinnedTagsEditor() {
    const pinnedTags = this.plugin._syncEngine.getPinnedTags();
    const searchInput = this.contentEl.querySelector('.sudoku-search-input');
    new SudokuTagModal(this.plugin, '固定常用标签到面板', pinnedTags, (tagsArray) => {
      const currentPinned = this.plugin._syncEngine.getPinnedTags();
      currentPinned.forEach(t => this.plugin._syncEngine.unpinTag(t));
      tagsArray.forEach(t => this.plugin._syncEngine.pinTag(t));
      this._renderItems(searchInput?.value.toLowerCase() || '');
    }).open();
  }

  _onTagContextMenu(e, tagName) {
    e.preventDefault();
    e.stopPropagation();

    const menu = new Menu();
    const pinnedTags = this.plugin._syncEngine.getPinnedTags();
    const isPinned = pinnedTags.includes(tagName);

    menu.addItem(item => {
      if (isPinned) {
        item.setTitle('📍 从面板取消固定')
          .setIcon('unpin')
          .onClick(() => {
            this.plugin._syncEngine.unpinTag(tagName);
            this._render();
          });
      } else {
        item.setTitle('📌 固定常用标签到面板')
          .setIcon('pin')
          .onClick(() => {
            this.plugin._syncEngine.pinTag(tagName);
            this._render();
          });
      }
    });

    menu.addItem(item => {
      item.setTitle(this.activeTags.has(tagName) ? '取消过滤此标签' : '以此标签过滤')
        .setIcon('filter')
        .onClick(() => {
          if (this.activeTags.has(tagName)) this.activeTags.delete(tagName);
          else this.activeTags.add(tagName);
          this._renderItems(this.contentEl.querySelector('.sudoku-search-input')?.value.toLowerCase() || '');
        });
    });

    menu.showAtMouseEvent(e);
  }

  _createFolder() {
    new SudokuInputDialog(this.app, '新建文件夹', '', (name) => {
      if (!name) return;
      this.plugin._syncEngine.createFolder(name);
      this._render();
    }).open();
  }

  _renameFolder(uuid, oldName) {
    new SudokuInputDialog(this.app, '重命名文件夹', oldName, (newName) => {
      if (!newName || newName === oldName) return;
      try {
        this.plugin._syncEngine.renameFolder(uuid, newName);
        this._render();
      } catch (e) {
        new Notice('重命名失败，名称可能已存在');
      }
    }).open();
  }

  _deleteFolder(uuid, name) {
    new SudokuFolderDeleteConfirmModal(this.app, name, () => {
      this.plugin._syncEngine.deleteFolder(uuid);
      this._render();
    }).open();
  }

  async _createNew() {
    const templates = this.plugin._syncEngine.getTemplates();

    const proceedWithCreation = async (template = null) => {
      new SudokuInputDialog(this.app, template ? `从模板创建: ${template.name}` : '新建九宫格', '', async (name) => {
        if (!name) return;

        const jgFolder = `${this.plugin.manifest.dir}/.jg`;
        const uuid = crypto.randomUUID();
        const fileName = `${uuid}.jg`;
        const filePath = `${jgFolder}/${fileName}`;
        const adapter = this.app.vault.adapter;

        let data;
        if (template) {
          // 读取模板文件内容
          try {
            const templatePath = `${jgFolder}/${template.uuid}.jg`;
            const templateContent = await adapter.read(templatePath);
            data = JSON.parse(templateContent);
            data.name = name; // 更新名称
          } catch (e) {
            console.error('Failed to read template file:', e);
          }
        }

        if (!data) {
          data = {
            version: 1,
            name: name,
            columns: 3,
            cells: Array.from({ length: 9 }, (_, i) => ({
              id: `cell${i + 1}`,
              content: '',
              mode: 'text'
            }))
          };
        }

        await adapter.write(filePath, JSON.stringify(data, null, 2));

        // 同步到数据库
        if (this.plugin._syncEngine) {
          this.plugin._syncEngine.syncSudoku(uuid, name, null, data);
          // 如果是从模板创建，继承视觉设置（但不继承 is_template）
          if (template) {
            if (template.theme_color) this.plugin._syncEngine.setThemeColor(uuid, template.theme_color);
            if (template.icon) this.plugin._syncEngine.setIcon(uuid, template.icon);
          }
        }

        new Notice(`九宫格 "${name}" 已创建`);
        await this._render();
      }).open();
    };

    if (templates.length > 0) {
      new SudokuTemplateSelectModal(this.plugin, templates, (selected) => {
        proceedWithCreation(selected);
      }).open();
    } else {
      await proceedWithCreation(null);
    }
  }

  async _rename(filePath, data) {
    new SudokuInputDialog(this.app, '改名', data.name, async (newName) => {
      if (!newName || newName === data.name) return;

      data.name = newName;
      await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));

      // 同步到数据库
      if (this.plugin._syncEngine) {
        const uuid = filePath.split('/').pop().replace('.jg', '');
        this.plugin._syncEngine.syncSudoku(uuid, newName, null, data);
      }

      new Notice('重命名成功');
      await this._render();
    }).open();
  }

  async _delete(filePath, sudokuName) {
    new SudokuDeleteConfirmModal(this.app, sudokuName, async () => {
      await this.app.vault.adapter.remove(filePath);

      // 从数据库删除
      if (this.plugin._syncEngine) {
        const uuid = filePath.split('/').pop().replace('.jg', '');
        this.plugin._syncEngine.deleteSudoku(uuid);
      }

      new Notice('已删除');
      await this._render();
    }).open();
  }

  async refresh() {
    await this._render();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SudokuGridView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.data = null;
    this.filePath = null;
    this.selectedCellIndex = 4; // 默认选中中间格
    this.sidebarWidth = 600; // 默认侧边栏宽度设为最大
    this.isEditing = false;
    this._blurTimeout = null;
    this._diskSaveTimeout = null;
    this._isDirty = false;
    this._saveInProgress = false;
    this._savePromise = Promise.resolve();
    this.nodes = [];
    this._collapsedIndices = new Set(); // 记录折叠的节点索引
  }

  getViewType() { return SUDOKU_VIEW_TYPE; }
  getDisplayText() { return this.data ? `九宫格: ${this.data.name}` : '九宫格视图'; }
  getIcon() { return 'grid'; }

  getState() {
    return {
      filePath: this.filePath
    };
  }

  async setState(state, result) {
    if (state && state.filePath) {
      this.filePath = state.filePath;
      await this.refresh();
    }
    await super.setState(state, result);
  }

  async setFilePath(filePath) {
    this.filePath = filePath;
    await this.refresh();
    // 强制 Obsidian 记录当前视图状态
    this.app.workspace.requestSaveLayout();
  }

  async refresh() {
    if (!this.filePath) return;

    // 如果内存中有未保存的修改，且正在编辑，不要直接覆盖内存，防止清空当前输入
    if (this._isDirty && this.isEditing) {
      console.log('[Sudoku] Memory is dirty, skipping refresh to prevent data loss');
      return;
    }

    try {
      const content = await this.app.vault.adapter.read(this.filePath);
      this.data = JSON.parse(content);
      console.log('[Sudoku] Loaded data from disk:', this.filePath);
      await this.onOpen();
    } catch (e) {
      console.error('[Sudoku] Failed to load sudoku data:', e);
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('sudoku-viewer-view');
    contentEl.empty();

    if (!this.data) {
      if (this.filePath) {
        // 如果有路径但没数据，说明是恢复状态，自动尝试刷新
        await this.refresh();
        return;
      }
      contentEl.createEl('p', { text: '未加载数据', cls: 'sudoku-empty-msg' });
      return;
    }

    const layout = contentEl.createDiv({ cls: 'sudoku-viewer-layout' });

    // 左侧/顶部：3x3 导航网格
    this.sidebarEl = layout.createDiv({ cls: 'sudoku-viewer-sidebar' });
    this.sidebarEl.style.width = '40%';
    this.sidebarEl.style.minWidth = '300px';
    this.sidebarEl.style.maxWidth = '600px';
    this.sidebarEl.style.flex = '0 0 auto'; // 强制尊重宽度，不被挤压

    // 渲染标题和日期 (顶部)
    this.sidebarEl.createDiv({ text: this.data.name, cls: 'sudoku-viewer-name' });
    const meta = this.sidebarEl.createDiv({ cls: 'sudoku-viewer-meta' });
    const uuid = this.filePath.split('/').pop().replace('.jg', '');
    const sudoku = this.plugin._syncEngine?.getSudokus().find(s => s.uuid === uuid);
    const createTime = sudoku?.created_at
      ? new Date(sudoku.created_at * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : '未知时间';
    meta.createEl('span', { text: createTime, cls: 'sudoku-viewer-date' });

    this._renderSidebar(this.sidebarEl);

    // 分割线（仅电脑端显示移动效果）
    const resizer = layout.createDiv({ cls: 'sudoku-viewer-resizer' });
    this._initResizer(resizer, this.sidebarEl);

    // 右侧/底部：详情内容区
    this.mainEl = layout.createDiv({ cls: 'sudoku-viewer-main' });
    this._renderDetail(this.mainEl);
  }

  _initResizer(resizer, sidebar) {
    resizer.onmousedown = (e) => {
      e.preventDefault();
      const startX = e.clientX;
      // 核心修复：获取当前侧边栏的实际像素宽度，而不是使用硬编码的 state 初始值
      const startWidth = sidebar.getBoundingClientRect().width;
      this.sidebarWidth = startWidth;

      // 全局状态：防止拖动时由于鼠标移速过快导致的光标闪烁或焦点丢失
      document.body.addClass('sudoku-is-resizing');
      resizer.addClass('is-dragging');

      const onMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        // 范围限制：300px - 800px，确保侧边栏不会过于窄小
        const newWidth = Math.max(300, Math.min(800, startWidth + deltaX));
        this.sidebarWidth = newWidth;

        sidebar.style.width = `${newWidth}px`;
        sidebar.style.flex = `0 0 ${newWidth}px`;
      };

      const onMouseUp = () => {
        document.body.removeClass('sudoku-is-resizing');
        resizer.removeClass('is-dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // 保存布局状态
        this.app.workspace.requestSaveLayout();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }

  _renderSidebar(container) {
    const grid = container.createDiv({ cls: 'sudoku-viewer-grid' });
    this.data.cells.forEach((cell, index) => {
      const cellEl = grid.createDiv({
        cls: `sudoku-viewer-cell ${this.selectedCellIndex === index ? 'is-selected' : ''}`,
        attr: { 'data-index': index }
      });

      if (cell.content || cell.name) {
        cellEl.addClass('has-content');
        if (cell.mode === 'query') {
          cellEl.addClass('is-query');
          setIcon(cellEl, 'search');
        } else {
          // 简短预览：优先显示格子名称，若无则显示内容预览
          const preview = cell.name || (cell.content ? cell.content.substring(0, 10) : '...');
          cellEl.createDiv({ text: preview, cls: 'cell-dot-preview' });
        }
      }

      cellEl.onclick = async () => {
        if (this.selectedCellIndex === index) return;

        // 如果正在编辑，确保保存当前工作
        if (this.isEditing) {
          await this._saveCurrentEdits();
          this.isEditing = false;
        }

        // 更新选中状态
        const prevSelected = container.querySelector('.sudoku-viewer-cell.is-selected');
        if (prevSelected) prevSelected.removeClass('is-selected');
        cellEl.addClass('is-selected');

        this.selectedCellIndex = index;
        this._renderDetail(this.mainEl);
      };
    });
  }

  async onClose() {
    // 视图关闭时尝试最后一次强制保存到磁盘
    if (this.isEditing) {
      await this._saveCurrentEdits();
    } else {
      await this._saveData();
    }
  }

  async _saveData() {
    await this.app.vault.adapter.write(this.filePath, JSON.stringify(this.data, null, 2));

    // 实时同步到数据库：使搜索立刻生效
    if (this.plugin._syncEngine) {
      const uuid = this.filePath.split('/').pop().replace('.jg', '');
      const stats = await this.app.vault.adapter.stat(this.filePath);
      this.plugin._syncEngine.syncSudoku(uuid, this.data.name, stats, this.data);
    }
  }

  async _saveCurrentEdits() {
    if (!this.data || !this.titleInput) return;

    const cell = this.data.cells[this.selectedCellIndex];
    cell.name = this.titleInput.value.trim();

    // 从节点列表反向序列化回字符串内容
    if (this.nodesContainer) {
      cell.content = this._nodesToContent();
      // 记录折叠状态
      cell.collapsed = Array.from(this._collapsedIndices);
    }

    this._isDirty = true;
    console.log(`[Sudoku] Syncing to memory...`);
    await this._enqueueSave();
  }

  // 核心落盘逻辑：将所有修改排队串行写入，防止 Windows/iCloud 文件冲突
  async _enqueueSave() {
    if (!this._isDirty) return;

    // 将新的保存请求挂在队列末尾
    this._savePromise = this._savePromise.then(async () => {
      try {
        this._saveInProgress = true;
        await this._saveData();
        this._isDirty = false;
        console.log('[Sudoku] Successfully persisted to disk');
      } catch (err) {
        console.error('[Sudoku] PERSISTENCE FAILED:', err);
      } finally {
        this._saveInProgress = false;
      }
    });

    return this._savePromise;
  }

  async _renderDetail(container) {
    // 1. 清理所有待处理的定时器
    if (this._blurTimeout) {
      clearTimeout(this._blurTimeout);
      this._blurTimeout = null;
    }
    if (this._diskSaveTimeout) {
      clearTimeout(this._diskSaveTimeout);
      this._diskSaveTimeout = null;
    }

    container.empty();
    const cell = this.data.cells[this.selectedCellIndex];

    // 头部：标题和操作
    const header = container.createDiv({ cls: 'sudoku-detail-header' });
    const headerLeft = header.createDiv({ cls: 'sudoku-detail-header-left' });

    const backBtn = headerLeft.createDiv({ cls: 'sudoku-detail-back-btn', attr: { 'aria-label': '返回管理面板' } });
    setIcon(backBtn, 'chevron-left');
    backBtn.onclick = async () => {
      if (this.isEditing) await this._saveCurrentEdits();
      this.plugin.openSudokuMgmtView();
    };

    const titleContainer = headerLeft.createDiv({ cls: 'sudoku-detail-title' });
    const sudokuName = this.data.name || '未命名';
    const cellName = cell.name || `格子 ${this.selectedCellIndex + 1}`;

    if (this.isEditing) {
      // 编辑模式下，头部仅显示九宫格总名称，具体格子名在编辑器第一行修改
      titleContainer.createEl('h1', { text: sudokuName });

      const actions = header.createDiv({ cls: 'sudoku-detail-actions' });
      // 按钮已去除，通过失去焦点自动保存
    } else {
      // 查看模式下的标题：九宫名 - 格子名
      titleContainer.createEl('h1', { text: `${sudokuName} - ${cellName}` });
    }

    const contentBody = container.createDiv({ cls: 'sudoku-detail-body' });

    if (this.isEditing) {
      contentBody.addClass('is-structured-editing');
      const editorScroll = contentBody.createDiv({ cls: 'sudoku-editor-scroll' });

      // 1. 标题节点 (根节点)
      const titleWrap = editorScroll.createDiv({ cls: 'edit-title-node-wrap' });
      titleWrap.createDiv({ cls: 'outliner-title-dot' });
      this.titleInput = titleWrap.createEl('input', {
        cls: 'edit-title-input',
        value: cell.name || ''
      });
      this.titleInput.placeholder = '输入标题...';
      this.titleInput.oninput = () => {
        this._isDirty = true;
        // 实时同步更侧边栏九宫格中的文字
        const cellEl = this.sidebarEl.querySelector(`.sudoku-viewer-cell[data-index="${this.selectedCellIndex}"]`);
        if (cellEl) {
          let sidebarCellPreview = cellEl.querySelector(`.cell-dot-preview`);
          if (!sidebarCellPreview && (this.titleInput.value || cell.content)) {
            // 如果之前是空的，现在有了内容，创建预览元素并添加类
            cellEl.addClass('has-content');
            sidebarCellPreview = cellEl.createDiv({ cls: 'cell-dot-preview' });
          }

          if (sidebarCellPreview) {
            sidebarCellPreview.textContent = this.titleInput.value || (cell.content ? cell.content.substring(0, 10) : '...');
          }

          // 如果清空了标题且没有内容，移除标识
          if (!this.titleInput.value && !cell.content) {
            cellEl.removeClass('has-content');
            if (sidebarCellPreview) sidebarCellPreview.remove();
          }
        }
      };

      // 2. 真正的大纲编辑器区域
      const contentWrap = editorScroll.createDiv({ cls: 'edit-content-node-wrap' });
      this.nodesContainer = contentWrap.createDiv({ cls: 'outliner-editor-container' });

      // 核心修复：进入编辑或切换格子时，必须确保数据正确解析并同步
      const needsParse = !this.nodes || this.nodes.length === 0 || this._lastParsedIndex !== this.selectedCellIndex;
      if (needsParse) {
        console.log('[Sudoku] Parsing content for editor:', cell.content);
        this.nodes = this._parseContentToNodes(cell.content || '');
        if (this.nodes.length === 0) this.nodes.push({ text: '', level: 0 });
        this._lastParsedIndex = this.selectedCellIndex;
        this._collapsedIndices = new Set(cell.collapsed || []);
      }

      // 2. 核心可见性算法：线性水位扫描，解决折叠溢出 Bug
      let activeFoldLevel = Infinity;
      this.nodes.forEach((node, idx) => {
        // 判定是否可见
        if (node.level > activeFoldLevel) {
          node.isHidden = true;
        } else {
          node.isHidden = false;
          // 到达了同级或更高级，重置折叠判定
          activeFoldLevel = this._collapsedIndices.has(idx) ? node.level : Infinity;
        }

        // 判定是否拥有子节点 (用于显示箭头)
        node.hasChildren = (idx + 1 < this.nodes.length) && (this.nodes[idx + 1].level > node.level);
        node.isCollapsed = this._collapsedIndices.has(idx);
      });

      // 渲染所有节点
      this.nodes.forEach((node, idx) => {
        if (!node.isHidden) {
          this._renderEditableNode(this.nodesContainer, node, idx);
        }
      });

      // 统一模糊保存
      const handleBlur = () => {
        if (this._blurTimeout) clearTimeout(this._blurTimeout);
        this._blurTimeout = setTimeout(async () => {
          const active = document.activeElement;
          // 判定焦点是否逸出编辑器
          const isInternal = active && (active.hasClass('node-input') || active === this.titleInput || this.nodesContainer.contains(active));
          if (isInternal) return;

          if (this.isEditing) {
            await this._saveCurrentEdits();
            this.isEditing = false;
            this._renderDetail(container);
          }
        }, 200);
      };
      this.titleInput.onblur = handleBlur;

      // 仅在首次进入或手动通过双击进入时聚焦标题
      if (!this._skipInitialFocus) {
        setTimeout(() => this.titleInput.focus(), 50);
      }
      this._skipInitialFocus = false; // 重置标记

    } else {
      contentBody.addClass('is-clickable');
      contentBody.setAttribute('aria-label', '双击进入编辑模式');
      contentBody.ondblclick = () => {
        if (this.isEditing) return;
        this.isEditing = true;
        this.nodes = null; // 触发彻底重解析
        this._skipInitialFocus = false;
        this._renderDetail(container);
      };

      const contentInner = contentBody.createDiv({ cls: 'sudoku-detail-content outliner-rendered' });
      if (cell.content || cell.name) {
        if (cell.mode === 'query') {
          const { MarkdownRenderer } = require('obsidian');
          await MarkdownRenderer.renderMarkdown(cell.content, contentInner, '', this.plugin);
        } else {
          // 渲染为节点模式 (Outliner)
          const outliner = contentInner.createDiv({ cls: 'sudoku-outliner-view' });

          // 1. 标题行 (区分显示)
          if (cell.name) {
            const titleNode = outliner.createDiv({ cls: 'outliner-title-node' });
            titleNode.createDiv({ cls: 'outliner-title-dot' }); // 标题特有的点
            titleNode.createDiv({ text: cell.name, cls: 'outliner-title-text' });
          }

          // 2. 内容节点
          if (cell.content) {
            const lines = cell.content.split('\n');
            const nodesContainer = outliner.createDiv({ cls: 'outliner-nodes-container' });

            // 解析折叠状态图标
            const collapsedSet = new Set(cell.collapsed || []);
            let activeFoldLevel = Infinity;

            lines.forEach((line, idx) => {
              if (line.trim() === '' && lines.length > 1) return;

              const tabMatch = line.match(/^\t+/);
              const level = tabMatch ? tabMatch[0].length : 0;

              // 判定是否可见 (线性水位算法)
              let isHidden = false;
              if (level > activeFoldLevel) {
                isHidden = true;
              } else {
                isHidden = false;
                activeFoldLevel = collapsedSet.has(idx) ? level : Infinity;
              }
              if (isHidden) return;

              const nodeEl = nodesContainer.createDiv({ cls: 'outliner-node' });
              if (level > 0) nodeEl.style.paddingLeft = `${level * 24}px`;

              // 判定当前行是否有子节点 (智能跳过空行)
              let hasChildren = false;
              for (let i = idx + 1; i < lines.length; i++) {
                if (lines[i].trim() !== '') {
                  const nextTabMatch = lines[i].match(/^\t+/);
                  const nextLevel = nextTabMatch ? nextTabMatch[0].length : 0;
                  if (nextLevel > level) hasChildren = true;
                  break;
                }
              }
              if (hasChildren) nodeEl.addClass('has-children');

              const bullet = nodeEl.createDiv({ cls: 'outliner-node-bullet' });
              const toggleIcon = bullet.createDiv({ cls: 'node-toggle-icon' });
              setIcon(toggleIcon, 'chevron-down');

              if (collapsedSet.has(idx)) {
                bullet.addClass('is-collapsed');
                nodeEl.addClass('is-collapsed');
              }

              // 阅读模式点击折叠
              bullet.onclick = async (e) => {
                e.stopPropagation();
                const currentCollapsed = new Set(cell.collapsed || []);
                if (currentCollapsed.has(idx)) {
                  currentCollapsed.delete(idx);
                } else {
                  currentCollapsed.add(idx);
                }
                cell.collapsed = Array.from(currentCollapsed);

                // 同步持久化
                this._isDirty = true;
                await this._enqueueSave();
                this._renderDetail(container);
              };

              nodeEl.createDiv({ text: line.trim(), cls: 'outliner-node-text' });
            });
          }
        }
      } else {
        contentInner.createDiv({ text: '此格子暂无内容 (双击进入节点编辑模式)', cls: 'sudoku-detail-empty' });
      }
    }
  }

  // --- 大纲编辑器核心方法 ---

  _parseContentToNodes(content) {
    if (!content) return [];
    return content.split('\n').map(line => {
      const tabMatch = line.match(/^\t+/);
      const level = tabMatch ? tabMatch[0].length : 0;
      return { text: line.trim(), level };
    });
  }

  _nodesToContent() {
    return this.nodes.map(node => '\t'.repeat(node.level) + node.text).join('\n');
  }

  _renderEditableNode(parent, node, index) {
    const nodeEl = parent.createDiv({
      cls: 'outliner-editor-node',
      attr: { 'data-level': node.level + 1 }
    });
    if (node.hasChildren) nodeEl.addClass('has-children');
    if (node.isCollapsed) nodeEl.addClass('is-collapsed');

    const bulletWrap = nodeEl.createDiv({ cls: 'node-bullet-wrap' });
    const toggleIcon = bulletWrap.createDiv({ cls: 'node-toggle-icon' });
    setIcon(toggleIcon, 'chevron-down');
    bulletWrap.createDiv({ cls: 'node-bullet' });

    // 处理折叠点击
    bulletWrap.onclick = (e) => {
      e.stopPropagation();
      if (!node.hasChildren) return;

      if (this._collapsedIndices.has(index)) {
        this._collapsedIndices.delete(index);
      } else {
        this._collapsedIndices.add(index);
      }
      this._skipInitialFocus = true;
      this._renderDetail(this.mainEl);
      this._saveCurrentEdits(); // 记录折叠状态
    };

    const inputContainer = nodeEl.createDiv({ cls: 'node-input-container' });
    const input = inputContainer.createEl('textarea', {
      cls: 'node-input',
      attr: { rows: 1 }
    });
    input.value = node.text || ''; // 显式赋值保障可靠性
    input.placeholder = '节点内容...';

    // 动态高度调整
    const adjustHeight = () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    };
    setTimeout(adjustHeight, 0);

    input.oninput = () => {
      node.text = input.value;
      this._isDirty = true;
      adjustHeight();

      // 即时同步到 cell.content 内存对象，防止异步保存读取到旧数据
      const cell = this.data.cells[this.selectedCellIndex];
      cell.content = this._nodesToContent();

      // 节流落盘
      clearTimeout(this._diskSaveTimeout);
      this._diskSaveTimeout = setTimeout(() => this._enqueueSave(), 1500);
    };

    input.onblur = () => {
      if (this._blurTimeout) clearTimeout(this._blurTimeout);
      this._blurTimeout = setTimeout(async () => {
        const active = document.activeElement;
        if (active && (active.hasClass('node-input') || active === this.titleInput)) return;
        if (this.isEditing) {
          await this._saveCurrentEdits();
          this.isEditing = false;
          this._renderDetail(this.mainEl);
        }
      }, 300);
    };

    input.onkeydown = async (e) => {
      // 在执行结构操作前，先确保当前输入的文字已同步到内存
      node.text = input.value;

      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const newNode = { text: '', level: node.level };
        this.nodes.splice(index + 1, 0, newNode);
        this._skipInitialFocus = true;
        this._renderDetail(this.mainEl);
        setTimeout(() => {
          const allInputs = this.nodesContainer.querySelectorAll('.node-input');
          allInputs[index + 1]?.focus();
        }, 10);
      } else if (e.key === 'Backspace' && input.value === '' && this.nodes.length > 1) {
        e.preventDefault();
        this.nodes.splice(index, 1);
        this._skipInitialFocus = true;
        this._renderDetail(this.mainEl);
        setTimeout(() => {
          const allInputs = this.nodesContainer.querySelectorAll('.node-input');
          const prevInput = allInputs[index - 1] || this.titleInput;
          prevInput.focus();
        }, 10);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (node.level > 0) node.level--;
        } else {
          if (node.level < 8) node.level++;
        }
        this._skipInitialFocus = true;
        this._renderDetail(this.mainEl);
        setTimeout(() => {
          const allInputs = this.nodesContainer.querySelectorAll('.node-input');
          allInputs[index]?.focus();
        }, 10);
      } else if (e.key === 'ArrowUp' && input.selectionStart === 0) {
        const allInputs = this.nodesContainer.querySelectorAll('.node-input');
        if (index > 0) (allInputs[index - 1]).focus();
        else this.titleInput.focus();
      } else if (e.key === 'ArrowDown' && input.selectionEnd === input.value.length) {
        const allInputs = this.nodesContainer.querySelectorAll('.node-input');
        if (index < allInputs.length - 1) (allInputs[index + 1]).focus();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.isEditing = false;
        await this._saveCurrentEdits();
        this._renderDetail(this.mainEl);
      }
    };
  }

  async _saveData() {
    await this.app.vault.adapter.write(this.filePath, JSON.stringify(this.data, null, 2));

    // 实时同步到数据库：使搜索立刻生效
    if (this.plugin._syncEngine) {
      const uuid = this.filePath.split('/').pop().replace('.jg', '');
      const stats = await this.app.vault.adapter.stat(this.filePath);
      this.plugin._syncEngine.syncSudoku(uuid, this.data.name, stats, this.data);
    }
  }
}

// ========== Plugin ==========
module.exports = class SQLiteManagerPlugin extends Plugin {
  async onload() {
    this._sqlEngine = null;
    this._syncEngine = null;

    // 注册九宫格视图
    this.registerView(
      SUDOKU_VIEW_TYPE,
      (leaf) => new SudokuGridView(leaf, this)
    );

    // 注册九宫格管理视图
    this.registerView(
      SUDOKU_MGMT_VIEW_TYPE,
      (leaf) => new SudokuMgmtView(leaf, this)
    );

    // 添加命令：打开九宫格管理面板
    this.addCommand({
      id: 'open-sudoku-manager',
      name: '打开九宫格视图',
      callback: () => {
        this.openSudokuMgmtView();
      }
    });

    // 所有文档都应用 SuperTagView，不再依赖 YAML frontmatter
    this.registerMarkdownPostProcessor((element, context) => {
      this._processTagElements(element, context);
    });

    // 初始化块同步引擎
    this.app.workspace.onLayoutReady(async () => {
      try {
        this._syncEngine = new BlockSyncEngine(this);
        await this._syncEngine.init();
        await this._syncEngine.initialSync();
        console.log('[SupertagManager] Block sync engine initialized');

        // 同步完成后，通知所有已打开的管理视图和网格视图刷新
        this.app.workspace.getLeavesOfType(SUDOKU_MGMT_VIEW_TYPE).forEach(leaf => {
          if (leaf.view instanceof SudokuMgmtView) leaf.view.refresh();
        });
        this.app.workspace.getLeavesOfType(SUDOKU_VIEW_TYPE).forEach(leaf => {
          if (leaf.view instanceof SudokuGridView) leaf.view.refresh();
        });
      } catch (e) {
        console.error('[SupertagManager] Failed to init sync engine:', e);
      }
    });

    // 文件事件监听
    this.registerEvent(this.app.vault.on('modify', async (file) => {
      // 1. 处理块同步
      if (this._syncEngine && file instanceof TFile && file.extension === 'md') {
        this._syncEngine.syncFile(file);
      }

      // 2. 实时刷新九宫格视图 (管理面板 & 格子详情) & 缓存更新
      if (file instanceof TFile && file.extension === 'jg') {
        try {
          if (this._syncEngine) {
            const uuid = file.name.replace('.jg', '');
            const stats = await this.app.vault.adapter.stat(file.path);
            const content = await this.app.vault.adapter.read(file.path);
            const data = JSON.parse(content);
            this._syncEngine.syncSudoku(uuid, data.name, stats, data);
          }
        } catch (e) {
          console.error('[SudokuSync] Failed to sync modified .jg file:', e);
        }

        const leaves = this.app.workspace.getLeavesOfType(SUDOKU_MGMT_VIEW_TYPE);
        leaves.forEach(leaf => {
          if (leaf.view instanceof SudokuMgmtView) leaf.view.refresh();
        });

        const gridLeaves = this.app.workspace.getLeavesOfType(SUDOKU_VIEW_TYPE);
        gridLeaves.forEach(leaf => {
          if (leaf.view instanceof SudokuGridView && leaf.view.filePath === file.path) {
            leaf.view.refresh();
          }
        });
      }
    }));

    this.registerEvent(this.app.vault.on('create', (file) => {
      if (this._syncEngine && file instanceof TFile && file.extension === 'md') {
        this._syncEngine.syncFile(file);
      }
    }));

    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (this._syncEngine && file instanceof TFile && file.extension === 'md') {
        this._syncEngine.handleRename(file, oldPath);
      }
    }));

    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (this._syncEngine && file instanceof TFile) {
        this._syncEngine.handleDelete(file.path);
      }
    }));

    // 查询面板：注入到编辑器底部
    this._queryPanel = new SupertagQueryPanel(this);
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this._injectQueryPanel()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this._injectQueryPanel()));

    // 监听视图切换（例如从编辑切到阅读）
    this.registerEvent(this.app.workspace.on('view-change', () => this._injectQueryPanel()));

    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => this._injectQueryPanel(), 500);
    });
  }

  onunload() {
    if (this._syncEngine) {
      this._syncEngine.close();
      this._syncEngine = null;
    }
    if (this._queryPanel) {
      this._queryPanel.destroy();
      this._queryPanel = null;
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  _injectQueryPanel() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !this._queryPanel) return;

    // 针对不同模式寻找合适的容器
    let container = null;

    if (view.getMode() === 'preview') {
      // 阅读模式
      container = view.containerEl.querySelector('.markdown-preview-sizer.markdown-preview-section');
    } else {
      // 编辑模式 (Live Preview 或 Source Mode)
      // 在 CM6 中，面板应该放在 .cm-sizer 底部
      container = view.containerEl.querySelector('.cm-sizer');

      // 如果没找到 .cm-sizer (可能是旧版本或特殊布局)，尝试更通用的选择器
      if (!container) {
        container = view.containerEl.querySelector('.markdown-source-view .cm-content')?.parentElement;
      }
    }

    if (container) {
      container.classList.add('has-supertag-query');
      this._queryPanel.attach(container);

      // 设置观察者，防止 Obsidian 动态刷新时把面板删掉 (特别是在阅读模式)
      if (this._observer) this._observer.disconnect();
      this._observer = new MutationObserver(() => {
        if (container && this._queryPanel && this._queryPanel.panelEl) {
          if (!container.contains(this._queryPanel.panelEl)) {
            container.appendChild(this._queryPanel.panelEl);
          }
        }
      });
      this._observer.observe(container, { childList: true });
    } else {
      // 如果容器还没准备好，稍后再试一次
      if (!this._injectRetryCount) this._injectRetryCount = 0;
      if (this._injectRetryCount < 5) {
        this._injectRetryCount++;
        setTimeout(() => this._injectQueryPanel(), 300);
      } else {
        this._injectRetryCount = 0;
      }
    }
  }

  // 固定数据库路径
  getDbPath() {
    return `${this.manifest.dir}/fuxi.db`;
  }

  // 将 Obsidian 渲染的 <a class="tag"> 元素替换为自定义药丸
  _processTagElements(element, context) {
    const tagEls = element.querySelectorAll('a.tag');
    if (tagEls.length === 0) return;

    const filePath = context.sourcePath;

    tagEls.forEach(tagEl => {
      const rawText = tagEl.textContent.trim();
      const tagName = rawText.startsWith('#') ? rawText.slice(1) : rawText;
      if (!tagName) return;

      // 在替换前获取行号（tagEl 脱离 DOM 后 getSectionInfo 返回 null）
      const sectionInfo = context.getSectionInfo(tagEl);
      const lineHint = sectionInfo ? sectionInfo.lineStart : null;

      const color = getTagColor(tagName);
      const pillContainer = document.createElement('span');
      pillContainer.className = 'supertag-pill-container';

      const pill = document.createElement('span');
      pill.className = 'supertag-pill supertag-pill-clickable';
      pill.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:${color.text};`;

      const hashEl = document.createElement('span');
      hashEl.className = 'supertag-pill-hash';
      hashEl.textContent = '#';
      pill.appendChild(hashEl);

      const nameEl = document.createElement('span');
      nameEl.className = 'supertag-pill-name';
      nameEl.textContent = tagName;
      pill.appendChild(nameEl);

      const toggleBtn = document.createElement('span');
      toggleBtn.className = 'supertag-pill-toggle';
      toggleBtn.textContent = '▾';
      pill.appendChild(toggleBtn);

      // 点击标签名 → 属性定义配置
      nameEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        new SupertagPropertiesModal(this.app, this, tagName).open();
      });
      hashEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        new SupertagPropertiesModal(this.app, this, tagName).open();
      });

      // 点击 ▾ → 属性值写入（lineHint 用于定位具体块）
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        new SupertagValuesModal(this.app, this, tagName, filePath, lineHint).open();
      });

      pillContainer.appendChild(pill);
      tagEl.parentNode.replaceChild(pillContainer, tagEl);
    });
  }

  async getSQLEngine() {
    if (this._sqlEngine) return this._sqlEngine;
    const jsPath = `${this.manifest.dir}/sql-wasm.js`;
    const wasmPath = `${this.manifest.dir}/sql-wasm.wasm`;
    const jsCode = await this.app.vault.adapter.read(jsPath);
    const initSqlJsFunc = new Function('module', 'exports', jsCode);
    const mockModule = { exports: {} };
    initSqlJsFunc(mockModule, mockModule.exports);
    const initSqlJs = mockModule.exports.default || mockModule.exports;
    const wasmBinary = await this.app.vault.adapter.readBinary(wasmPath);
    this._sqlEngine = await initSqlJs({ wasmBinary });
    return this._sqlEngine;
  }

  async openSudokuView(filePath) {
    let leaf = null;
    const leaves = this.app.workspace.getLeavesOfType(SUDOKU_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: SUDOKU_VIEW_TYPE,
        active: true,
      });
    }

    const view = leaf.view;
    if (view instanceof SudokuGridView) {
      await view.setFilePath(filePath);
    }

    this.app.workspace.revealLeaf(leaf);
  }

  async openSudokuMgmtView() {
    let leaf = null;
    const leaves = this.app.workspace.getLeavesOfType(SUDOKU_MGMT_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: SUDOKU_MGMT_VIEW_TYPE,
        active: true,
      });
    }

    this.app.workspace.revealLeaf(leaf);
  }
};