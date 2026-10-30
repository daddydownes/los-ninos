import { DatabaseSync } from 'node:sqlite';

// A small local D1 adapter. Production uses Cloudflare's DB binding directly.
export class SqliteD1 {
  constructor(filename = ':memory:') {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  }

  prepare(sql) { return new Statement(this, sql); }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  execute() {
    const start = performance.now();
    const statement = this.db.sqlite.prepare(this.sql);
    const results = statement.all(...this.params).map(row => ({ ...row }));
    const stats = this.db.sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta: { ...stats, duration: performance.now() - start } };
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first(column) {
    const row = this.execute().results[0];
    return row ? (column ? row[column] : row) : null;
  }
  async raw(options = {}) {
    const statement = this.db.sqlite.prepare(this.sql);
    const rows = statement.all(...this.params).map(row => Object.values(row));
    return options.columnNames ? [statement.columns().map(column => column.name), ...rows] : rows;
  }
}

export default SqliteD1;
