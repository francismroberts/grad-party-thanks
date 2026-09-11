# CLAUDE.md

Static site on GitHub Pages at `thanks.francismroberts.com`. Supabase
holds all media and metadata. Full spec: `docs/thank-you-site-spec.md`.
Build in the stages the spec lists; don't build ahead.

## Supabase

- Tables, buckets and RLS policies already exist. Never recreate them.
- The admin key in `.env` is a modern `sb_secret_` key, not a legacy
  `service_role` JWT. Use it as the admin client key in `scripts/`.
- The publishable key in `assets/supabase-config.js` is public by design.

## Secrets

- Never commit `.env`. Stage files by name, not `git add .`, and check
  with `git ls-files | grep -x .env` after committing.
- If the key is ever committed, rotate it in Supabase. Do not rewrite
  history.

## Node

- Node 26 makes an unclosed FileHandle a hard `ERR_INVALID_STATE` at GC.
  Pass Buffers to sharp and exifr, not file paths. `scripts/package.json`
  pins `engines` to `>=20 <27`.

## Git

- Prefer a plain commit to `main` over opening a PR.

## End of every session

Update `docs/STATUS.md` and commit it. Under 30 lines. Header must read:

```
# Status — updated YYYY-MM-DD HH:MM PT
```

Get the real time with `TZ=America/Los_Angeles date "+%Y-%m-%d %H:%M"`.
Sections: what was built, decisions that differ from the spec and why,
anything broken or unfinished, what the next session should start with.
