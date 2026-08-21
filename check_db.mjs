process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgres://postgres.eognactytrulrnqdexrf:OeCLyEtCOz9jhPBL@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';

async function checkData() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(`SELECT * FROM user_stats WHERE sync_id = 'bxughtbqrk'`);
  console.log("Data:", JSON.stringify(res.rows, null, 2));
  await client.end();
}

checkData();
