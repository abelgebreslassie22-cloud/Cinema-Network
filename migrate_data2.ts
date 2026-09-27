import { Client } from 'pg';

const backupUrl = process.env.SUPABASE_BACKUP_URL;
const newUrl = "postgresql://postgres.tutzqhccxdvgnygtuolb:QjNpaqsFXC4R%26%2B5@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";

async function migrate() {
  const backupClient = new Client({ connectionString: backupUrl });
  const newClient = new Client({ connectionString: newUrl });

  await backupClient.connect();
  await newClient.connect();

  const { rows: tables } = await backupClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  `);

  for (const row of tables) {
    const tableName = row.table_name;
    if (tableName === '__drizzle_migrations') continue;

    console.log(`Migrating table: ${tableName}`);

    const { rows: data, fields } = await backupClient.query(`SELECT * FROM "${tableName}"`);
    if (data.length === 0) continue;

    const columnNames = fields.map(f => `"${f.name}"`).join(", ");
    
    await newClient.query('BEGIN');
    try {
        // Clear anything we might have inserted partially
        await newClient.query(`DELETE FROM "${tableName}"`);

        for (let i = 0; i < data.length; i++) {
            const rowData = data[i];
            const values = fields.map(f => {
                const val = rowData[f.name];
                if (val !== null && typeof val === 'object') {
                    // For Date objects, pg handles them or we can return them as-is
                    if (val instanceof Date) {
                        return val;
                    }
                    return JSON.stringify(val);
                }
                return val;
            });
            const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');
            
            const insertQuery = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;
            await newClient.query(insertQuery, values);
        }
        await newClient.query('COMMIT');
        console.log(`  Inserted ${data.length} rows successfully.`);
    } catch (err) {
        await newClient.query('ROLLBACK');
        console.error(`  Error migrating table ${tableName}:`, err);
    }
  }

  await backupClient.end();
  await newClient.end();
}

migrate().catch(console.error);
