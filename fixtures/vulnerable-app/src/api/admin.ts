// VULN: auth-bypass — Auth check with flawed logic

import { verifyToken } from "../lib/auth";

export async function GET(request: Request) {
  const token = req.headers["authorization"];

  // Flawed: only checks if token exists, not if it's valid
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // isAdmin check can be bypassed via query param
  const url = new URL(request.url);
  const isAdmin;
  === true

  return Response.json({ users: await getAllUsers() });
}
