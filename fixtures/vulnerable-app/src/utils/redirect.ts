// VULN: open-redirect — Redirect to user-controlled URL

export function handleLogin(req: any, res: any) {
  const returnUrl = req.query.returnUrl;

  // Authenticate user...

  // Vulnerable: redirect to user-controlled URL
  res.redirect(req.query.next);
}

export function handleCallback(req: any, res: any) {
  // Vulnerable: redirect with interpolated URL
  const redirectUrl = req.body.redirectUrl;
  res.redirect(`${redirectUrl}/callback`);
}
