# Security notes (Studara)

This repository contains **production-adjacent** code and operational notes. Treat it as sensitive.

## Rules

- **Never commit secrets**: API keys, SSH keys, passwords, DB connection strings, tokens, private URLs.
- **Use `.env` files locally** and keep only `*.example` templates in the repo.
- **Store secrets outside the repo** (recommended: 1Password / Bitwarden).
- **Assume anything committed can leak** (screenshots, logs, videos, “temporary” notes).

## If a secret was exposed

1. **Rotate it immediately** (API keys, JWT secrets, DB passwords).
2. **Invalidate sessions/tokens** if applicable.
3. Update the server/app configs with the new value.

## Suggested repo hygiene

- Keep large binary assets (videos/audio) out of version control.
- Keep `uploads/`, `dist/`, `.expo/` and `node_modules/` untracked.

