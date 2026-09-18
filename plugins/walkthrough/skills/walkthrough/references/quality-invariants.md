# Quality invariants — what the hub checks, and how not to trip it

The hub runs [`catalog-health.ts`](../../../../../apps/hub/src/lib/catalog-health.ts)
on every project page and shows the findings in a banner. Each check exists
because a real run produced the failure. Knowing them in advance is cheaper than
discovering them in a red banner with your run id on it.

None of this is bureaucracy. The purpose of the whole tool is that its output
can be believed without verification; every check below closes a specific way
that promise gets broken.

---

## `duplicate-captures` — warning

**Check.** MD5 every step's capture within a walkthrough; flag any group with
identical bytes.

**What it means.** Nothing happened in the app between those steps. Two claimed
states, one actual state. The walkthrough asserts a progression that didn't
occur.

**The usual cause**, by a wide margin: a scroll helper that no-ops. Playwright's
`scrollIntoViewIfNeeded()` does nothing when the element is already visible, and
at 1440×900 a surprising amount is already visible. Same class of bug on mobile
when a swipe lands on an already-scrolled-to-bottom list.

**Prevention — hash at capture time against every capture so far:**

```js
const hash = createHash("md5").update(readFileSync(path)).digest("hex");
const clash = seen.get(hash);          // a Map of hash → filename, per walk
if (clash) {
  throw new Error(`${file} is byte-identical to ${clash} — the action didn't change the screen`);
}
seen.set(hash, file);
```

**Compare against all of them, not just the previous one.** A guard that keeps
only the last hash shipped a real duplicate: step 3 matched step 1 (a tab click
that was a no-op, because that tab was already the active view) but differed
from step 2, so it passed. The hub compares every pair, so a one-step lookback
is weaker than the check it exists to pre-empt.

For a step that's legitimately optional — one of several tab views — catch the
duplicate, skip that step with a logged reason, and keep the rest of the walk.
Aborting a whole feature because its third view wasn't distinct throws away two
good steps.

This is in [`scripts/walk-wikipedia.mjs`](../../../../../scripts/walk-wikipedia.mjs) and it
caught two real duplicates the first time it ran. Copy it.

**When two steps genuinely show the same screen**, they're one step. Merge them.

---

## `missing-captures` — warning

**Check.** `fs.existsSync` on every referenced file.

**What it means.** The JSON claims a capture that isn't on disk. The step renders
blank while still counting toward coverage — worse than an absent step, because
it inflates the numbers.

**Causes.** A path written relative to the wrong root (they're relative to
`public/walkthroughs/{slug}/`, never absolute and never `public/`-prefixed); a
write that failed silently; a filename typo between the capture call and the
JSON.

**Prevention.** Have the capture function *return* the relative path and use its
return value in the JSON. Never type the path twice.

---

## `claimed-but-absent` — warning

**Check.** `surfaceStatus[surface] === "done"` but no `{featureId}.{surfaceId}.json`
exists.

**What it means.** The catalog says this was walked and there is nothing at all
behind the claim. The loudest possible signal that coverage is overstated.

**Causes.** Setting status optimistically before the walk; a run that died
between updating the catalog and writing the walkthrough.

**Prevention.** Write the walkthrough file *first*, then update
`surfaceStatus`. If the run dies, you're left understating coverage rather than
overstating it — the correct direction to fail.

---

## `steps-without-action` — info

**Check.** Any step with `stepNumber > 1` and no `action`.

**What it means.** A reader can't tell what moved the app from the previous
state, and neither can the next agent trying to reproduce the walk. Step 1 is
exempt — it's the entry state, nothing had to happen to reach it.

**Prevention.** Write `action` as you perform the interaction, not afterwards
from memory. It should name the thing you did in the user's language: "Tapped
Continue", "Typed 4800 into the Monthly income field", "Ran `acme deploy
--dry-run`" — not "Navigated to the next state".

---

## `variants-as-features` — warning

**Check.** Features whose category is `i18n`/`localization`/`responsive`, or
whose id ends in a locale or form-factor suffix (`-ar`, `-mobile`, `-desktop`,
`-tablet`), especially when the base id also exists.

**What it means.** The feature count — the first number every reader sees — is
inflated by slices of features already listed. An app with 8 features and 3
locales appears to have 24.

**Prevention.** One `featureId` per feature. Locale goes in `locale`, form
factor in `surface`. If Arabic prose genuinely needs its own write-up, that's a
second walkthrough *file* for the same feature id, not a second feature.

---

## `thin-walkthrough` — info

**Check.** A walkthrough with one step.

**What it means.** Usually the scenario stopped at the front door: the screen was
captured, its behaviour wasn't.

**Prevention.** Define "done" before you start, and make it include the outcome.
For a form: submitted *and* the confirmation captured. For a list: at least one
row expanded. For a CLI command: the successful run *and* a realistic failure.

A genuinely single-state feature exists — a static legal page, a splash screen —
and one step is the right answer there. The check is `info`, not `warning`, for
exactly that reason. Add a `note` saying so.

---

## `all-synthetic` — warning

**Check.** Every step across the project is `verificationStatus: "synthetic"`.

**What it means.** Nothing was ever driven. It's a map, not a walkthrough —
useful as a plan, not evidence that anything works.

**Prevention.** Don't reach for synthetic as a shortcut. It's for surfaces you
genuinely cannot reach: hardware the simulator lacks, a flow that needs two
devices, a screen behind a gate only the customer can open. If the reason is "the
driver wasn't set up", fix the driver.

Being honest here costs nothing. Presenting synthetic work as captured and being
found out costs the project its credibility, and the finding is one `grep` away.

---

## `unknown-surface` — info

**Check.** A `surfaceStatus` key that's neither a built-in preset nor declared
in `catalog.json › surfaces`.

**What it means.** Captures render unframed with a raw slug as the label.

**Prevention.** Use a built-in id, or add a full surface definition with real
dimensions and a frame kind.

---

## `persona-without-journey` — info

**Check.** A persona declared in `catalog.json` with no journey file on disk
carrying at least one scene.

**What it means.** The persona grid renders every declared persona as an equal,
so a catalog listing six with one journey between them is displaying six times
the coverage it has.

Note what is checked: the **filesystem**, not `keyJourneys`. The catalog is a
claim and the journey files are the evidence, and this check exists precisely
to measure the gap — so believing `keyJourneys` would defeat it.

**Prevention.** Either walk at least one journey per persona, or don't declare
personas you aren't going to walk. One well-walked persona beats four declared
ones, and costs less to maintain.

This replaces an earlier `no-persona-journeys` check that only fired when a
catalog had **more than one** persona — and so stayed silent on the single
worst case: exactly one persona, declared, never walked.

---

## `open-issues` — warning when any is a blocker, else info

**Check.** Entries in `issues.json` whose `status` is `open`.

**What it means.** The walk hit something broken and recorded it. That is the
walk working correctly — it observes the product, it does not repair it.

**Prevention.** None; this is not a defect in the walkthrough. Don't suppress
it by editing `issues.json`, and don't "fix" the app to make it go away unless
fixing the app is the task you were given. The one thing that *is* wrong is
recording an issue and never telling anybody, which is why these surface in the
health banner rather than in a tab of their own.

---

## Things the hub can't check, that matter more

Automated checks catch mechanical dishonesty. These are the ones that need you:

**Is the capture actually legible?** A half-loaded page, a mid-animation frame, a
flash of unstyled text, a skeleton loader. All of these are byte-distinct, exist
on disk, and pass every check while showing the reader nothing. Look at every
capture.

**Is it the right screen?** A failed navigation that landed on a 404, or a
locale switch that silently didn't apply, produces a perfectly valid capture of
the wrong thing. Verify state explicitly — check `document.documentElement.dir`
for an RTL switch, check for a heading you expect, rather than trusting that the
click worked.

**Is the data real?** An empty list because the backend was down looks identical
to an empty list because the feature has an empty state. The first is a broken
capture; the second is documentation. Check the network log.

**Is the persona right?** Signed in as an admin while documenting the member
view produces captures that are true of *a* user and false of *the* user. If you
see aggregate data where personal data belongs, the auth step failed.

**Does the description say what the user gets?** "The form rejects a national id
that fails its checksum before any request is sent" is documentation. "A red div
appears below the input" is a DOM description that tells a reader nothing about
the product.
