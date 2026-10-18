/**
 * Small RFC 4180 CSV reader: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF, a leading BOM.
 * Returns { headers, rows } where each row is an object keyed by the lower-cased, trimmed header, plus `__line`
 * (the 1-based line of the row in the file, for error reports). Blank lines are skipped.
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => {
    pushField();
    if (record.some((f) => f.trim() !== '')) records.push({ cells: record, line: recordLine });
    record = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\r') { if (src[i + 1] === '\n') i++; line++; pushRecord(); recordLine = line; }
    else if (c === '\n') { line++; pushRecord(); recordLine = line; }
    else field += c;
  }
  if (inQuotes) {
    const err = new Error('A quoted value is never closed. Check for a missing closing quote.');
    err.code = 'CSV_UNTERMINATED_QUOTE';
    throw err;
  }
  if (field !== '' || record.length) pushRecord();

  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].cells.map((h) => h.trim().toLowerCase());
  const rows = records.slice(1).map(({ cells, line: ln }) => {
    const row = { __line: ln };
    headers.forEach((h, idx) => { if (h) row[h] = (cells[idx] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}
