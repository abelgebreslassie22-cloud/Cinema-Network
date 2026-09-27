import { Client } from 'pg';

const backupUrl = process.env.SUPABASE_BACKUP_URL;
const newUrl = "postgresql://postgres.tutzqhccxdvgnygtuolb:QjNpaqsFXC4R%26%2B5@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";

async function migrate() {
  if (!backupUrl) throw new Error("Missing backup URL");

  const backupClient = new Client({ connectionString: backupUrl });
  const newClient = new Client({ connectionString: newUrl });

  await backupClient.connect();
  await newClient.connect();

  console.log("Connected to both databases.");

  const { rows: tables } = await backupClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  `);

  console.log(`Found ${tables.length} tables to migrate.`);

  // Disable triggers/foreign key constraints temporarily for smooth insertion
  // (Assuming we might have some, though the schema above doesn't show any)

  for (const row of tables) {
    const tableName = row.table_name;
    // skip drizzle migrations table just in case
    if (tableName === '__drizzle_migrations') continue;

    console.log(`Migrating table: ${tableName}`);

    const { rows: data, fields } = await backupClient.query(`SELECT * FROM "${tableName}"`);
    console.log(`  Read ${data.length} rows.`);

    if (data.length === 0) continue;

    const columnNames = fields.map(f => `"${f.name}"`).join(", ");
    
    await newClient.query('BEGIN');
    try {
        for (let i = 0; i < data.length; i++) {
            const rowData = data[i];
            const values = fields.map(f => rowData[f.name]);
            const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');
            
            const insertQuery = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;
            await newClient.query(insertQuery, values);
        }
        await newClient.query('COMMIT');
        console.log(`  Inserted successfully.`);
    } catch (err) {
        await newClient.query('ROLLBACK');
        console.error(`  Error migrating table ${tableName}:`, err);
    }
  }

  await backupClient.end();
  await newClient.end();
  console.log("Migration complete.");
}

migrate().catch(console.error);
