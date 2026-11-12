/**
 * Esquema del índice (spec §3). Cada entrada es una migración; `PRAGMA user_version` dice cuántas ya corrieron.
 * Una migración publicada no se edita: se agrega otra.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE volume (
    volume_id INTEGER PRIMARY KEY,
    serial_number TEXT NOT NULL UNIQUE,
    mount_path TEXT NOT NULL,
    has_recycle_bin INTEGER NOT NULL,
    online INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE watched_root (
    root_id INTEGER PRIMARY KEY,
    volume_id INTEGER NOT NULL REFERENCES volume(volume_id),
    path TEXT NOT NULL UNIQUE,
    recursive INTEGER NOT NULL DEFAULT 1,
    exclude_globs TEXT NOT NULL DEFAULT '[]',
    extension_mode TEXT NOT NULL DEFAULT 'inherit',
    folder_mark TEXT NOT NULL DEFAULT '{"kind":"inherit"}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE root_error (
    root_id INTEGER NOT NULL REFERENCES watched_root(root_id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    message TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (root_id, path)
  );

  CREATE TABLE content (
    content_id INTEGER PRIMARY KEY,
    size_bytes INTEGER NOT NULL,
    partial_hash TEXT,
    full_hash TEXT UNIQUE
  );

  CREATE TABLE file (
    file_id INTEGER PRIMARY KEY,
    volume_id INTEGER NOT NULL REFERENCES volume(volume_id),
    fs_file_ref TEXT NOT NULL,
    root_id INTEGER REFERENCES watched_root(root_id) ON DELETE SET NULL,
    content_id INTEGER REFERENCES content(content_id),
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at TEXT NOT NULL,
    opened_at TEXT,
    opened_source TEXT,
    partial_hash TEXT,
    presence TEXT NOT NULL DEFAULT 'present',
    loose INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT NOT NULL,
    UNIQUE (volume_id, fs_file_ref)
  );
  CREATE INDEX file_opened ON file(presence, opened_at);
  CREATE INDEX file_modified ON file(presence, modified_at);
  CREATE INDEX file_root ON file(root_id);
  CREATE INDEX file_size ON file(size_bytes);
  CREATE INDEX file_path ON file(path);

  CREATE TABLE provenance (
    file_id INTEGER PRIMARY KEY REFERENCES file(file_id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence TEXT,
    inference_version INTEGER NOT NULL
  );
  CREATE INDEX provenance_origin ON provenance(origin);

  CREATE TABLE batch (
    batch_id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    description TEXT NOT NULL,
    undone_at TEXT
  );
  CREATE TABLE batch_item (
    batch_id INTEGER NOT NULL REFERENCES batch(batch_id) ON DELETE CASCADE,
    file_id INTEGER NOT NULL,
    before_decision TEXT,
    trashed_from TEXT,
    moved_from TEXT,
    moved_to TEXT,
    copied_to TEXT
  );

  CREATE TABLE file_decision (
    file_id INTEGER PRIMARY KEY REFERENCES file(file_id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    due_date TEXT,
    expires_on TEXT,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    batch_id INTEGER,
    decided_at TEXT NOT NULL,
    content_hash_at_decision TEXT,
    size_at_decision INTEGER,
    closed_reason TEXT
  );
  CREATE INDEX decision_due ON file_decision(action, due_date);

  CREATE TABLE rule (
    rule_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    threshold_days INTEGER
  );
  CREATE TABLE rule_match (
    rule_id TEXT NOT NULL,
    file_id INTEGER NOT NULL REFERENCES file(file_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL DEFAULT 'pending',
    file_modified_at TEXT NOT NULL,
    detail TEXT,
    found_at TEXT NOT NULL,
    PRIMARY KEY (rule_id, file_id)
  );

  CREATE TABLE extension_filter (
    root_id INTEGER REFERENCES watched_root(root_id) ON DELETE CASCADE,
    extension TEXT NOT NULL
  );
  CREATE UNIQUE INDEX extension_filter_key ON extension_filter(ifnull(root_id, 0), extension);

  CREATE TABLE photo (
    file_id INTEGER PRIMARY KEY REFERENCES file(file_id) ON DELETE CASCADE,
    analyzed_modified_at TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format TEXT NOT NULL,
    jpeg_quality INTEGER,
    has_exif INTEGER NOT NULL,
    taken_at TEXT,
    date_source TEXT NOT NULL,
    phash TEXT,
    sharpness REAL
  );
  CREATE INDEX photo_phash ON photo(phash);
  CREATE TABLE photo_preference (group_key TEXT PRIMARY KEY, preferred_file_id INTEGER NOT NULL);

  CREATE TABLE tag (tag_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, color TEXT);
  CREATE TABLE file_tag (
    file_id INTEGER NOT NULL REFERENCES file(file_id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tag(tag_id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    PRIMARY KEY (file_id, tag_id)
  );
  CREATE TABLE root_tag (
    root_id INTEGER NOT NULL REFERENCES watched_root(root_id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tag(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (root_id, tag_id)
  );

  CREATE TABLE saved_search (search_id INTEGER PRIMARY KEY, name TEXT NOT NULL, filters TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 1);

  CREATE TABLE event_outbox (
    event_id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    delivered_at TEXT
  );

  CREATE VIRTUAL TABLE file_fts USING fts5(name, path, note, tokenize = 'unicode61 remove_diacritics 2');
  CREATE TRIGGER file_fts_insert AFTER INSERT ON file BEGIN
    INSERT INTO file_fts(rowid, name, path, note) VALUES (new.file_id, new.name, new.path, '');
  END;
  CREATE TRIGGER file_fts_update AFTER UPDATE OF name, path ON file BEGIN
    UPDATE file_fts SET name = new.name, path = new.path WHERE rowid = new.file_id;
  END;
  CREATE TRIGGER file_fts_delete AFTER DELETE ON file BEGIN
    DELETE FROM file_fts WHERE rowid = old.file_id;
  END;
  CREATE TRIGGER decision_fts_note AFTER INSERT ON file_decision BEGIN
    UPDATE file_fts SET note = new.note WHERE rowid = new.file_id;
  END;
  CREATE TRIGGER decision_fts_note_update AFTER UPDATE OF note ON file_decision BEGIN
    UPDATE file_fts SET note = new.note WHERE rowid = new.file_id;
  END;
  `,
  // reglas propias (lámina 13); su propuesta va a rule_match con rule_id «U-{rule_id}»
  `
  CREATE TABLE custom_rule (
    rule_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL,
    extensions TEXT NOT NULL,
    name_contains TEXT NOT NULL,
    idle_days INTEGER NOT NULL,
    min_bytes INTEGER,
    created_at TEXT NOT NULL
  );
  `
]
