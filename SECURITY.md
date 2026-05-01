# Security policy

If you find a vulnerability in deepsec itself (the tool), please **do not
open a public issue**.

Report it via GitHub's private reporting mechanism:

<https://github.com/vercel-labs/deepsec/security/advisories/new>

You'll get a response within 5 business days. Critical issues are
prioritized.

## What's in scope

- The CLI and any supported subcommand
- The plugin contracts in `deepsec/config`
- Anything that ships in this repo

## What's out of scope

- Findings that deepsec itself produces about *other* codebases — those
  are vulnerabilities in those codebases, not in deepsec
- Issues in third-party plugins not maintained in this repo
- Issues in the AI providers deepsec calls (report those to the provider)

Thank you for keeping deepsec users safe.
