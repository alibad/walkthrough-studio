# Personas and journeys

A feature walkthrough answers *"what does this screen do"*. A persona journey
answers *"what happened to this person"* — and it's the artifact non-engineers
actually read. Every project should ship at least one.

The difference is framing, not data: a journey mostly reuses feature captures,
re-sequenced through one person's day and narrated in their terms.

---

## Detecting personas

Personas come from the app's own structure, not from imagination.

**Signals, strongest first:**

1. **Auth roles.** The role enum, the permissions table, the `authRole` values
   in the catalog. If the app distinguishes admin from member, those are two
   personas because they see two different products.
2. **Divergent navigation.** Where the sidebar, tab bar or menu differs by
   role, that difference *is* the persona boundary.
3. **Route groups or guards.** `(admin)`, `@login_required(role="staff")`, a
   start destination that branches on a session.
4. **Onboarding paths.** An app that asks "are you a buyer or a seller?" has
   just told you its personas.
5. **Seed data and fixtures.** Demo accounts are usually named after the
   personas the team already thinks in.

**An unauthenticated visitor is a persona** — often the most important one, and
the most often skipped. The first-run experience is what determines whether
anyone becomes a user.

Don't invent personas the app doesn't distinguish. Four declared personas with
one walked journey is worse than one persona walked properly: it's a claim the
hub will flag and a reader will discount.

---

## Writing the persona

```jsonc
{
  "id": "field-surveyor",
  "name": "Dana Whitfield",
  "description": "Surveys eleven sites a week across two counties, usually with no signal. Files notes from a phone in a vehicle between stops, and needs the app to hold what she typed until it can sync. She is not the person who chose this tool and has no interest in it beyond getting the day filed.",
  "authRole": "member",
  "entryPoint": "CaptureScreen",
  "keyJourneys": ["morning-survey"]
}
```

What makes a `description` useful:

- **A concrete situation**, not a job title. "Usually with no signal, from a
  phone in a vehicle" tells you what to capture. "Field operations
  professional" tells you nothing.
- **What they're trying to get done**, in their words, not the product's.
- **What they don't care about.** This is the most useful line and the one
  people omit. It's what stops a journey from becoming a feature tour.
- **No demographics you don't need.** Age, gender and nationality belong in a
  persona only when they change the product experience.

Write this well because everything downstream is generated from it — the
journey's framing, the portrait, the scene art. A generic description produces
generic everything.

Use a plausible full name rather than "The Admin". A journey reads as a story,
and stories need a subject. Keep it respectful and never a caricature.

### Portrait and scene must be the same person

A persona gets two images: a portrait for the card, and a wide scene for the
page masthead. Generating them as two independent calls from the same
description yields two different people, which a reader spots immediately.

Generate the **portrait first**, then generate the scene with the portrait
attached as a visual reference (the `images/edits` endpoint rather than
`images/generations`), and say so in the prompt: *the exact same person as the
reference — same face, same age, same hair, same skin tone.*

Worked example and the failure it fixes:
[`scripts/generate-creatives.mjs`](../../../../../scripts/generate-creatives.mjs)
and [`docs/theme.md`](../../../../../docs/theme.md).

---

## The journey arc

**5–9 scenes**, forming an arc that ends at a payoff. Fewer and it's a feature
walk with a name on it; more and it's a tour.

The shape that works:

1. **First contact** — how they arrive, and what they're carrying. Include the
   friction: the signal is bad, they're between meetings, they've forgotten the
   password.
2–3. **Orienting** — finding the thing they need. This is where a product's
   information architecture either works or doesn't, and where most real
   abandonment happens.
4–6. **The product moment** — the thing the product exists to do. This must be
   captured *after* the real response, not at the armed input. If the feature is
   a model answer, a generated document, or a processed upload, the result is
   the scene; the empty composer is not.
7–8. **Payoff** — what they walk away with. A filed note, an approved
   application, a booked appointment. Name it concretely.

Then tag each scene with what gates it: a model call, a camera, a microphone, an
upload, an interactive auth step. Those are the scenes that need planning, and
the ones most often skipped — which is precisely why they're the ones worth the
effort.

**Write the arc before capturing anything.** A journey stitched together
afterwards from whatever captures happened to exist reads exactly like that.

---

## Capturing

Reuse feature captures wherever the same state serves the journey — that's most
of them, and re-capturing identical states wastes time and disk. Capture new
frames for the connective tissue: the transitions between features, the
persona-specific empty states, the moment of friction at the start.

Where the journey changes form factor mid-way — starts on a phone in the field,
finishes on a desktop at the office — set `surface` per scene. The hub frames
each scene according to its own surface, so the shift is visible rather than
confusing.

Clone the closest archetype rather than starting from scratch.
[`scripts/walk-wikipedia.mjs`](../../../../../scripts/walk-wikipedia.mjs) is the reference in
this repo: surface setup, settle logic, the distinctness guard, the run
manifest.

---

## Writing the narrative

`narrative` is markdown, in the persona's frame:

> Dana has no bars in the valley and knows it. She photographs the culvert,
> types two lines about the erosion on the north bank, and taps Save — the note
> goes into a queue with eleven others, and the app says so plainly rather than
> failing.

Not:

> The capture screen renders a `TextEditor` bound to `note.body`, and tapping
> Save dispatches to the offline queue via `SyncCoordinator`.

The second is a code comment. The first is documentation, and it's also a
product review — writing a journey honestly is one of the fastest ways to find
out that a flow doesn't make sense.

Every scene needs `verificationStatus` set the same way a step does. `note` is
for genuine gaps: a surface that doesn't exist yet, state you can't
reconstruct, a flow carrying real personal data. Not for "the model call was
slow".

---

## Validation checklist

Before shipping a persona, all of these:

- [ ] The persona is one the app genuinely distinguishes, not invented
- [ ] `description` names a situation and something they don't care about
- [ ] 5–9 scenes, and the last one is a payoff you can state in one sentence
- [ ] Every scene has at least one frame, or a `note` explaining why not
- [ ] The product moment shows a real response, not an armed input
- [ ] No scene is a byte-duplicate of another
- [ ] Narratives are in the persona's terms, with no component names
- [ ] `keyJourneys` on the catalog persona lists the journey id
- [ ] The run is recorded in `runs.json`
- [ ] `/{project}/personas/{id}` renders with no missing captures

## Common failures

**Walking the chrome instead of the value.** Eight scenes of navigating menus
and one of the thing the product does. Invert it.

**A locale registered as a persona.** An Arabic-speaking user is the same
persona reading a translated interface. Locale is an axis, not a person.

**Stopping at the armed state.** The composer with text typed and nothing
submitted. The whole scene is the response.

**A persona per role, walked once.** Four declared, one walked. Declare what
you'll walk.

**Forgetting the run manifest.** The journey renders and the hub reports the
project as never walked.
