const { Plugin, Notice, Modal, Setting, TFile, MarkdownView } = require('obsidian');

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
    await this._saveDb();
    console.log(`[BlockSync] Initial sync complete: ${files.length} files`);
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

// ========== Plugin ==========
module.exports = class SQLiteManagerPlugin extends Plugin {
  async onload() {
    this._sqlEngine = null;
    this._syncEngine = null;

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
      } catch (e) {
        console.error('[SupertagManager] Failed to init sync engine:', e);
      }
    });

    // 文件事件监听
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (this._syncEngine && file instanceof TFile && file.extension === 'md') {
        this._syncEngine.syncFile(file);
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
};