// backend/src/services/sqlParser.service.js
import pkg from 'node-sql-parser';
const { Parser } = pkg;

const parser = new Parser();

export const sqlParserService = {
  /**
   * Parse raw SQL string and extract operations, tables, and security flags
   * @param {string} rawSql
   * @returns {object} { operation, tables, flags, normalized_sql, parse_error }
   */
  parse(rawSql) {
    if (!rawSql || typeof rawSql !== 'string') {
      return {
        operation: 'UNKNOWN',
        tables: [],
        flags: {
          has_where: false,
          select_star: false,
          has_limit: false,
          limit_count: null,
          has_union: false,
          is_ddl: false,
          has_comments: false,
          multi_statement: false,
          is_cross_schema: false,
          is_unbounded_read: false
        },
        normalized_sql: '',
        parse_error: false
      };
    }

    const trimmed = rawSql.trim();
    const hasComments = /(--|\/\*|#)/.test(trimmed);
    const multiStatement = /;\s*(\S+)/.test(trimmed.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, ''));

    // Normalize SQL: collapse whitespace, trim
    const normalized = trimmed.replace(/\s+/g, ' ');

    try {
      // Attempt AST parsing with MySQL dialect
      const { tableList, ast } = parser.parse(trimmed, { database: 'MySQL' });
      const astArray = Array.isArray(ast) ? ast : [ast];
      const primaryAst = astArray[0] || {};

      const opType = (primaryAst.type || '').toUpperCase();
      const isDdl = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(opType);

      // Extract tables
      const tables = (tableList || []).map(entry => {
        // format: "select::target_db::customers" or "select::null::customers"
        const parts = entry.split('::');
        if (parts.length >= 3) {
          const db = parts[1] !== 'null' ? parts[1] : '';
          const tbl = parts[2];
          return db ? `${db}.${tbl}` : tbl;
        }
        return entry;
      });

      // Distinct clean table names
      const uniqueTables = [...new Set(tables)];

      // Check SELECT *
      let selectStar = false;
      if (opType === 'SELECT') {
        if (primaryAst.columns === '*' || (Array.isArray(primaryAst.columns) && primaryAst.columns.some(c => c.expr?.column === '*'))) {
          selectStar = true;
        } else if (/\bSELECT\s+\*\s+FROM\b/i.test(normalized)) {
          selectStar = true;
        }
      }

      // Check WHERE
      const hasWhere = Boolean(primaryAst.where) || /\bWHERE\b/i.test(normalized);

      // Check LIMIT
      let hasLimit = false;
      let limitCount = null;
      if (primaryAst.limit && primaryAst.limit.value && primaryAst.limit.value.length > 0) {
        hasLimit = true;
        limitCount = primaryAst.limit.value[0]?.value ? parseInt(primaryAst.limit.value[0].value, 10) : null;
      } else {
        const limitMatch = normalized.match(/\bLIMIT\s+(\d+)/i);
        if (limitMatch) {
          hasLimit = true;
          limitCount = parseInt(limitMatch[1], 10);
        }
      }

      // Check UNION
      const hasUnion = Boolean(primaryAst._next) || /\bUNION\b/i.test(normalized);

      // Check cross-schema access
      const schemas = uniqueTables
        .map(t => t.includes('.') ? t.split('.')[0] : null)
        .filter(Boolean);
      const uniqueSchemas = [...new Set(schemas)];
      const isCrossSchema = uniqueSchemas.length > 1 || (uniqueSchemas.length === 1 && !['FinanceCorpDB', 'target_db', ''].includes(uniqueSchemas[0]));

      // Check unbounded bulk read
      const isUnboundedRead = (opType === 'SELECT' && selectStar && !hasLimit) ||
                              (opType === 'SELECT' && !hasWhere && !hasLimit);

      return {
        operation: opType || 'UNKNOWN',
        tables: uniqueTables,
        flags: {
          has_where: hasWhere,
          select_star: selectStar,
          has_limit: hasLimit,
          limit_count: limitCount,
          has_union: hasUnion,
          is_ddl: isDdl,
          has_comments: hasComments,
          multi_statement: multiStatement,
          is_cross_schema: isCrossSchema,
          is_unbounded_read: isUnboundedRead
        },
        normalized_sql: normalized,
        parse_error: false
      };
    } catch (parseErr) {
      // Graceful heuristic fallback on non-standard syntax / vendor statements
      return this.heuristicFallback(trimmed, normalized, hasComments, multiStatement);
    }
  },

  /**
   * Regex-based fallback parser when AST parser encounters non-standard statements
   */
  heuristicFallback(raw, normalized, hasComments, multiStatement) {
    let operation = 'UNKNOWN';
    const firstWord = (normalized.split(' ')[0] || '').toUpperCase();

    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(firstWord)) {
      operation = firstWord;
    } else if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(firstWord)) {
      operation = firstWord;
    }

    const isDdl = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(operation);
    const selectStar = operation === 'SELECT' && /\bSELECT\s+\*\s+FROM\b/i.test(normalized);
    const hasWhere = /\bWHERE\b/i.test(normalized);
    const hasUnion = /\bUNION\b/i.test(normalized);

    let hasLimit = false;
    let limitCount = null;
    const limitMatch = normalized.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      hasLimit = true;
      limitCount = parseInt(limitMatch[1], 10);
    }

    // Heuristic table extraction
    const tables = [];
    const fromMatch = normalized.match(/\bFROM\s+([`\w.]+)/i);
    if (fromMatch) tables.push(fromMatch[1].replace(/[`]/g, ''));

    const intoMatch = normalized.match(/\bINTO\s+([`\w.]+)/i);
    if (intoMatch) tables.push(intoMatch[1].replace(/[`]/g, ''));

    const updateMatch = normalized.match(/\bUPDATE\s+([`\w.]+)/i);
    if (updateMatch) tables.push(updateMatch[1].replace(/[`]/g, ''));

    const tableMatch = normalized.match(/\bTABLE\s+([`\w.]+)/i);
    if (tableMatch) tables.push(tableMatch[1].replace(/[`]/g, ''));

    const uniqueTables = [...new Set(tables)];
    const schemas = uniqueTables
      .map(t => t.includes('.') ? t.split('.')[0] : null)
      .filter(Boolean);
    const uniqueSchemas = [...new Set(schemas)];
    const isCrossSchema = uniqueSchemas.length > 1 || (uniqueSchemas.length === 1 && !['FinanceCorpDB', 'target_db', ''].includes(uniqueSchemas[0]));
    const isUnboundedRead = (operation === 'SELECT' && selectStar && !hasLimit) ||
                            (operation === 'SELECT' && !hasWhere && !hasLimit);

    return {
      operation,
      tables: uniqueTables,
      flags: {
        has_where: hasWhere,
        select_star: selectStar,
        has_limit: hasLimit,
        limit_count: limitCount,
        has_union: hasUnion,
        is_ddl: isDdl,
        has_comments: hasComments,
        multi_statement: multiStatement,
        is_cross_schema: isCrossSchema,
        is_unbounded_read: isUnboundedRead
      },
      normalized_sql: normalized,
      parse_error: true
    };
  }
};
