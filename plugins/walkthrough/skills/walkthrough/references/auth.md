# Auth — credentials, sessions, and gates you can't script

Walkthroughs run against other teams' staging environments, each with its own
gate. The rules here exist to keep secrets out of git and to stop a run
silently producing a gallery of login screens.

## Never put a secret in the registry

`projects.json` is committed. It holds **`$ENV_VAR` placeholders**:

```jsonc
"auth": {
  "type": "site-password",
  "loginLocation": "/en/login",
  "roles": { "default": { "password": "$ACME_STAGING_PASSWORD" } }
}
```

The value lives in `.env.local`, which is gitignored. One variable per project,
upper-snake-case.

A missing variable is a **loud failure**, not a fallback. Ask the user to
populate it. Do not proceed unauthenticated and capture the login wall — that
produces a walkthrough whose every step is a gate, which looks like coverage and
is worth nothing.

If you ever see a literal password in a diff to `projects.json`, stop and move
it to `.env.local`.

## Auth types

| `type` | Meaning | Scriptable |
|---|---|---|
| `none` | no gate | — |
| `site-password` | one shared password, no identity | yes |
| `email-password` | per-user accounts | yes |
| `oauth` | third-party provider | usually not |
| `sso` | Entra / Okta / Google Workspace | no — MFA |
| `biometric` | Face ID / Touch ID / Windows Hello | no |
| `api-token` | a token in env or a header | yes |
| `device-account` | an account configured on the device | one-time |
| `keychain` | OS keychain | one-time unlock |

## Sign in as the right persona

Not "any test account". The data in the captures should be what *that persona*
sees. An admin's view of a screen and a member's view are different
documentation, and capturing the wrong one is a subtle, hard-to-spot error —
everything renders, it's just false.

Check the feature's `authRole`, use that role's credentials, and during
reconnaissance verify the data matches: aggregate figures where personal data
belongs means the auth step failed. Stop and fix it rather than walking on.

## Reuse the session

Signing in once per run rather than once per feature is the single biggest speed
win available, and it removes a whole class of flake.

- **Web** — `context.storageState({ path })`, then
  `browser.newContext({ storageState })`. Never commit it: `*storageState.json`
  is gitignored.
- **iOS** — the simulator container persists between launches. Sign in once,
  don't erase the device mid-run.
- **Android** — same; `pm clear` is what resets it, so don't call it between
  features unless you mean to.
- **Desktop** — the OS keychain persists. Unlock once.
- **CLI** — export the token into the pty env for the whole run.

Note in `runs.json › config.notes` whether you walked from a clean state or a
reused session. They produce different first-run experiences and a reader
needs to know which they're looking at.

## Interactive-only gates

When `auth.interactiveOnly` is set, the gate cannot be scripted — MFA, a
hardware key, biometrics. The flow is:

1. Launch **headed**, not headless.
2. Ask the user to sign in, and wait. Tell them exactly what you need and that
   you'll continue once they confirm.
3. Persist the session to `auth.storageStatePath`.
4. Reuse it for every subsequent run until it expires.

Do not attempt to automate an MFA challenge, and never ask the user for a
one-time code to type in on their behalf.

## Onboarding and first-run flows

Many apps put a tour, a cookie banner or a "what's new" modal in front of the
first screen. Two honest options:

- **Capture it.** It's the real first-run experience and usually the most
  under-documented part of the product. Often the better choice.
- **Skip it deterministically** — an init script setting the dismissed flag, a
  launch argument, a pre-seeded preference. Record in `config.notes` that you
  did, so the absence of an onboarding walkthrough reads as a choice rather
  than an oversight.

What's not acceptable is dismissing it by hand each run and never mentioning it,
so nobody knows it exists.
