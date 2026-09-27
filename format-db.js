const fs = require('fs');

let code = fs.readFileSync('server-db.ts', 'utf8');

// Add sql-db imports
code = code.replace("import path from 'path';", "import path from 'path';\nimport { runSql, getSql } from './sql-db';");

fs.writeFileSync('server-db.ts', code);
