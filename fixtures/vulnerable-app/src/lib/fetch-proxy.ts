// VULN: ssrf — Fetch with user-controlled URL

export async function proxyRequest(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  // Vulnerable: user-controlled URL passed directly to fetch
  const response = await fetch(`${target}/api/data`);
  return response.json();
}

export async function fetchInternal(req: any) {
  // Vulnerable: request body used as URL
  const data = await req.json();
  return fetch(req.body.endpoint);
}
