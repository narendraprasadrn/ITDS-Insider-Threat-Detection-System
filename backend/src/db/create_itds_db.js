import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || 'Narendra@2006'
  });

  console.log('Connected to MySQL as root');
  await conn.query('CREATE DATABASE IF NOT EXISTS `itds_db`');
  await conn.query("GRANT ALL PRIVILEGES ON `itds_db`.* TO 'itds_admin'@'%' WITH GRANT OPTION");
  await conn.query("GRANT ALL PRIVILEGES ON `itds_db`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION");
  await conn.query('FLUSH PRIVILEGES');
  console.log('Successfully created itds_db and granted all privileges to itds_admin');

  // Verify itds_admin can now access itds_db
  const adminConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'itds_admin',
    password: 'ItdsAdminPass123!',
    database: 'itds_db'
  });
  console.log('Successfully connected to itds_db as itds_admin!');
  await adminConn.end();
  await conn.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
