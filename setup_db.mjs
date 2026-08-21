process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgres://postgres.eognactytrulrnqdexrf:OeCLyEtCOz9jhPBL@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';

async function setup() {
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();

  console.log("Connected to Supabase Postgres.");

  // Create table
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_stats (
      sync_id VARCHAR(255) PRIMARY KEY,
      sessions JSONB DEFAULT '[]'::jsonb,
      progress JSONB DEFAULT '{}'::jsonb,
      completions JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("Table created.");

  // Disable RLS so frontend can freely query it using the Anon Key
  await client.query(`ALTER TABLE user_stats DISABLE ROW LEVEL SECURITY;`);
  
  // Also create a policy just in case someone manually enables it later
  // We'll just grant all privileges to anon
  await client.query(`GRANT ALL ON TABLE user_stats TO anon;`);
  
  // Grant to authenticated just in case
  await client.query(`GRANT ALL ON TABLE user_stats TO authenticated;`);

  console.log("Permissions set. DB Setup Complete!");
  await client.end();
}

setup().catch(console.error);
