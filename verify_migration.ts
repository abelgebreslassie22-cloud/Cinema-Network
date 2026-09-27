import { Client } from 'pg';

const backupUrl = process.env.SUPABASE_BACKUP_URL;
const newUrl = "postgresql://postgres.tutzqhccxdvgnygtuolb:QjNpaqsFXC4R%26%2B5@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";

async function compare() {
  if (!backupUrl) throw new Error("Missing backup URL");

  const cBackup = new Client({ connectionString: backupUrl });
  const cNew = new Client({ connectionString: newUrl });
  
  await cBackup.connect();
  await cNew.connect();

  const { rows: tables } = await cBackup.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != '__drizzle_migrations'
  `);

  let hasMismatch = false;

  for (const t of tables) {
    const table = t.table_name;
    console.log(`Checking table: ${table}...`);
    
    // Attempt to find primary key for deterministic ordering
    const { rows: pkRows } = await cBackup.query(`
      SELECT a.attname
      FROM   pg_index i
      JOIN   pg_attribute a ON a.attrelid = i.indrelid
                           AND a.attnum = ANY(i.indkey)
      WHERE  i.indrelid = '"${table}"'::regclass
      AND    i.indisprimary;
    `);
    const pk = pkRows.length > 0 ? pkRows[0].attname : null;
    const orderBy = pk ? `ORDER BY "${pk}"` : '';

    const qBackup = await cBackup.query(`SELECT * FROM "${table}" ${orderBy}`);
    const qNew = await cNew.query(`SELECT * FROM "${table}" ${orderBy}`);

    if (qBackup.rows.length !== qNew.rows.length) {
      console.error(`❌ Mismatch in table ${table}: Backup has ${qBackup.rows.length} rows, New has ${qNew.rows.length} rows.`);
      hasMismatch = true;
      continue;
    }

    let tableMismatch = false;
    for (let i = 0; i < qBackup.rows.length; i++) {
      const rowB = qBackup.rows[i];
      const rowN = qNew.rows[i];
      
      for (const key of Object.keys(rowB)) {
        let valB = rowB[key];
        let valN = rowN[key];
        
        // Normalize Dates
        if (valB instanceof Date) valB = valB.getTime();
        if (valN instanceof Date) valN = valN.getTime();
        
        // Normalize objects to JSON strings for deep comparison
        if (typeof valB === 'object' && valB !== null) valB = JSON.stringify(valB);
        if (typeof valN === 'object' && valN !== null) valN = JSON.stringify(valN);

        if (valB !== valN) {
            let isEquivalent = false;
            // Check for JSON equivalence in case key order changed during insert
            try {
                if (typeof valB === 'string' && typeof valN === 'string') {
                    // Quick deep equal for parsed JSON objects
                    const objB = JSON.parse(valB);
                    const objN = JSON.parse(valN);
                    isEquivalent = JSON.stringify(objB, Object.keys(objB).sort()) === JSON.stringify(objN, Object.keys(objN).sort());
                }
            } catch(e) {}
            
            if (!isEquivalent) {
                console.error(`❌ Mismatch in table ${table} at row ${i} (PK/ID: ${pk ? rowB[pk] : 'N/A'}), column '${key}':`);
                console.error(`   Backup value:`, valB);
                console.error(`   New value:   `, valN);
                tableMismatch = true;
                hasMismatch = true;
                break; 
            }
        }
      }
      if (tableMismatch) break; 
    }
    
    if (!tableMismatch) {
        console.log(`✅ Table ${table} matches perfectly (${qBackup.rows.length} rows, ${Object.keys(qBackup.rows[0] || {}).length} columns verified).`);
    }
  }

  if (!hasMismatch) {
    console.log(`\n🎉 ALL TABLES MATCH PERFECTLY! 100% Data Integrity Verified.`);
  }

  await cBackup.end();
  await cNew.end();
}

compare().catch(console.error);
