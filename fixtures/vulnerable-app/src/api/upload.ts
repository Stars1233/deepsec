// VULN: path-traversal — User input used in file path

import fs from "node:fs";
import path from "node:path";

export async function POST(request: Request) {
  const { filename, data } = await request.json();

  // User-controlled filename joined directly to path
  const filePath = path.join("/uploads", filename);
  fs.writeFileSync(filePath, data);

  // Also vulnerable: reading user-controlled path
  const content = fs.readFileSync(`/data/${req.query.file}`);

  return Response.json({ path: filePath });
}
