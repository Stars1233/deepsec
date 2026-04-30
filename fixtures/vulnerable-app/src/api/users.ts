// VULN: missing-access-control — API route with no access control

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("id");

  // Anyone can list user data — no access control
  const users = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
  return Response.json(users);
}

export async function DELETE(request: Request) {
  const { id } = await request.json();

  // Anyone can delete users — no access control
  await db.query(`DELETE FROM users WHERE id = ${id}`);
  return Response.json({ success: true });
}
