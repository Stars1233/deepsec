// VULN: sql-injection — String interpolation in SQL queries

import { pool } from "./connection";

export async function getUser(userId: string) {
  // Vulnerable: string interpolation in SQL
  const result = await pool.query(`SELECT * FROM users WHERE id = '${userId}'`);
  return result.rows[0];
}

export async function searchUsers(name: string) {
  // Vulnerable: string concatenation in SQL
  const query = "SELECT * FROM users WHERE name LIKE '%" + name + "%'";
  return pool.query(query);
}

export async function deleteUser(id: string) {
  // Vulnerable: template literal in query
  return pool.query(`DELETE FROM users WHERE id = ${id}`);
}
