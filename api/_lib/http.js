// 共用的 HTTP 工具：統一錯誤格式 { error: { code, message } }
import { EngineError } from '../../src/engine/index.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

/**
 * 包裝一個 API handler：檢查 HTTP method、把回傳值轉成 JSON、統一處理錯誤。
 * @param {string[]} methods 允許的 method，例如 ['POST']
 * @param {(req, res) => Promise<any>} fn
 */
export function route(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    }
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof EngineError) {
        return res.status(400).json({ error: { code: err.code, message: err.message } });
      }
      console.error(err);
      return res.status(500).json({ error: { code: 'INTERNAL', message: '伺服器錯誤' } });
    }
  };
}

export function readBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      throw new HttpError(400, 'BAD_JSON', 'Request body 不是合法的 JSON');
    }
  }
  return req.body;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x) => typeof x === 'string' && UUID_RE.test(x);

/** 從 Authorization: Bearer <token> 取出 token，格式不對直接 401 */
export function bearerToken(req) {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!UUID_RE.test(token)) throw new HttpError(401, 'UNAUTHORIZED', '缺少或無效的 token');
  return token;
}

/** Supabase 回傳 error 時直接丟出 */
export function check({ data, error }) {
  if (error) throw error;
  return data;
}
