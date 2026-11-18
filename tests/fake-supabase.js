// 測試替身：用 supabase-js 的寫法操作 PGlite（嵌入式 Postgres），
// 只實作 API 用到的那幾個方法。讓整合測試不用連真的 Supabase。
class Query {
  constructor(pg, table) {
    this.pg = pg;
    this.table = table;
    this.op = null;
    this.cols = null;
    this.filters = [];
    this.orderBy = [];
    this.mode = 'many';
  }
  select(cols = '*') {
    this.op ??= 'select';
    this.cols = cols;
    return this;
  }
  insert(rows) {
    this.op = 'insert';
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(values) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col, v) {
    this.filters.push([col, '=', v]);
    return this;
  }
  in(col, arr) {
    this.filters.push([col, 'in', arr]);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this.orderBy.push(`${col} ${ascending ? 'asc' : 'desc'}`);
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  async exec() {
    const params = [];
    const p = (v) => {
      params.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
      return `$${params.length}`;
    };
    const val = (v) => (Array.isArray(v) ? JSON.stringify(v) : v); // 插入的陣列都是 jsonb
    const where = this.filters.length
      ? ' where ' + this.filters.map(([c, op, v]) => (op === 'in' ? `${c} = any(${p(v)})` : `${c} = ${p(v)}`)).join(' and ')
      : '';
    const ret = this.cols ? ` returning ${this.cols}` : '';
    let sql;
    if (this.op === 'select') {
      sql = `select ${this.cols} from ${this.table}${where}`;
      if (this.orderBy.length) sql += ` order by ${this.orderBy.join(', ')}`;
    } else if (this.op === 'insert') {
      const keys = Object.keys(this.rows[0]);
      const values = this.rows.map((r) => `(${keys.map((k) => p(val(r[k]))).join(', ')})`).join(', ');
      sql = `insert into ${this.table} (${keys.join(', ')}) values ${values}${ret}`;
    } else if (this.op === 'update') {
      const sets = Object.entries(this.values).map(([k, v]) => `${k} = ${p(val(v))}`).join(', ');
      sql = `update ${this.table} set ${sets}${where}${ret}`;
    } else if (this.op === 'delete') {
      sql = `delete from ${this.table}${where}${ret}`;
    }
    try {
      const { rows } = await this.pg.query(sql, params);
      if (this.mode === 'single') {
        if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${rows.length}` } };
        return { data: rows[0], error: null };
      }
      if (this.mode === 'maybe') return { data: rows[0] ?? null, error: null };
      return { data: this.op === 'select' || this.cols ? rows : null, error: null };
    } catch (e) {
      return { data: null, error: { code: e.code, message: e.message } };
    }
  }
}

export function fakeSupabase(pg) {
  return {
    from: (table) => new Query(pg, table),
    async rpc(name, args) {
      const keys = Object.keys(args);
      const params = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const sql = `select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`;
      try {
        const { rows } = await pg.query(sql, params);
        return { data: rows[0].result, error: null };
      } catch (e) {
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
  };
}
