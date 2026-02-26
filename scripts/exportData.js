require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

function sqlEscapeString(s) {
  return String(s).replace(/'/g, "''");
}

function sqlLiteralByType(val, type) {
  if (val === null || typeof val === 'undefined') return 'NULL';
  switch ((type || '').toLowerCase()) {
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'real':
    case 'double precision':
      return String(val);
    case 'boolean':
      return val ? 'TRUE' : 'FALSE';
    case 'date':
    case 'time without time zone':
    case 'time with time zone':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
      return `'${sqlEscapeString(val)}'`;
    case 'json':
      return `$$${JSON.stringify(val)}$$::json`;
    case 'jsonb':
      return `$$${JSON.stringify(val)}$$::jsonb`;
    default:
      return `'${sqlEscapeString(val)}'`;
  }
}

async function getColumns(table) {
  const res = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map(r => ({ name: r.column_name, type: r.data_type }));
}

async function getRows(table, idColumn = 'id') {
  try {
    const res = await pool.query(`SELECT * FROM ${table} ORDER BY ${idColumn}`);
    return res.rows;
  } catch (_) {
    const res = await pool.query(`SELECT * FROM ${table}`);
    return res.rows;
  }
}

async function writeTableDump(dir, idx, table, idColumn = 'id') {
  const cols = await getColumns(table);
  const rows = await getRows(table, idColumn);
  const colNames = cols.map(c => c.name);
  const lines = [];
  lines.push(`-- Data for table ${table}`);
  if (rows.length === 0) {
    lines.push('-- (no rows)');
  } else {
    for (const row of rows) {
      const vals = colNames.map((cn, i) => sqlLiteralByType(row[cn], cols[i].type));
      lines.push(`INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${vals.join(', ')});`);
    }
  }
  // setval for serial id
  if (colNames.includes(idColumn)) {
    lines.push(
      `SELECT setval(pg_get_serial_sequence('${table}', '${idColumn}'), COALESCE((SELECT MAX(${idColumn}) FROM ${table}), 0), true);`
    );
  }
  const n = String(idx).padStart(3, '0');
  const filePath = path.join(dir, `${n}_${table}.sql`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  return filePath;
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // Порядок с учетом внешних ключей
  const tables = [
    { name: 'rights' },
    { name: 'users' },
    { name: 'address' },
    { name: 'category' },
    { name: 'payment_status' },
    { name: 'ordertype' },
    { name: 'item' },
    { name: 'stockreport' },
    { name: 'stock' },
    { name: 'replenish' },
    { name: 'replenishstock' },
    { name: 'orders' },
    { name: 'order_details' },
    { name: 'order_photos' },
    { name: 'order_card_photo' },
    { name: 'contacts' },
    { name: 'order_channel_message' },
    { name: 'reminders' },
  ];

  const generated = [];
  for (let i = 0; i < tables.length; i++) {
    try {
      const f = await writeTableDump(outDir, i + 1, tables[i].name);
      generated.push(f);
    } catch (e) {
      // Если таблицы нет в схеме — пропускаем
      console.warn(`[skip] ${tables[i].name}: ${e.message}`);
    }
  }

  // Собираем единый all_data.sql
  const allFile = path.join(outDir, 'all_data.sql');
  const allLines = [];
  for (const f of generated) {
    allLines.push(fs.readFileSync(f, 'utf8'));
  }
  fs.writeFileSync(allFile, allLines.join('\n') + '\n', 'utf8');

  console.log(`Export complete. Files written to: ${outDir}`);
  console.log(['all_data.sql', ...generated.map(p => path.basename(p))].join('\n'));
  process.exit(0);
}

main().catch((e) => {
  console.error('Export error:', e);
  process.exit(1);
});

