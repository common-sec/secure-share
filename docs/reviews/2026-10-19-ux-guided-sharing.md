# UX design review: guided sharing, 2026-10-19

Reviewed: the Secure Share sender and recipient flows as they are in the code at `7ed848f`
(`src/tools/share.ts`, `src/tools/widgets.ts`), after the fixes from the
[2026-10-12 review](2026-10-12-ux-product-seo.md) (S1, S4, S5, S7, R2, R3). Input: the
maintainer's feedback after using the published site. The open items of the earlier review that
touch these flows (S2, S3, S6, R1, R4, R5) are folded in here.

**Overall:** both pages explain instead of guide. The creation page puts about 300 words of
explanation, two options and a passphrase field around one text box and one button. The recipient
page asks for a "passphrase" and then shows status lines, without telling the person what's
happening or what to do next. The proposal: design for one main scenario (sender and recipient on
a call), make the passphrase a few plain words that can be said aloud, and turn both pages into
short guided steps. Options and explanations move behind a "More options" disclosure and a
"How it works" link.

## Feedback and where it's addressed

| Feedback | Where |
|---|---|
| Too much text, packed into one page on creation | [§3](#3-sender-creating-the-link), G2 |
| Steps that could be saved, like copying the link automatically once created | [§3](#3-sender-creating-the-link), G3 |
| The recipient page isn't user friendly and doesn't guide the user | [§5](#5-recipient), G5 |
| Write the stories for how it should be used, and guide the user as much as possible | [§1](#1-user-stories) |
| If the passphrase must be complex, use the tool on a call: paste the link, say the passphrase. Then it should be simple, a good number of words | [§2](#2-a-passphrase-you-can-say-aloud), G1 |
| Hide options and help text, like "Let me check who's receiving" | [§3](#3-sender-creating-the-link), G2 |
| "Keep the screen on while waiting" should be part of the guidance when sharing | [§4](#4-sender-waiting-for-the-recipient), G4 |

---

## 1. User stories

**People.** The **sender** has something sensitive to hand over: an IT admin giving a colleague a
first password, a developer passing an API key, someone sending a relative the Wi-Fi password or
a scanned document. The **recipient** is often less technical, may be on a phone, and gets a link
they've never seen from someone they know.

**Main scenario: a call.** The link goes in the call's chat, the passphrase is said aloud. That
puts the two secrets on two channels with no extra effort, both people are online at the same
moment (which a browser-to-browser delivery needs), and they can compare the safety code by voice
if they want to. The app is designed around this case first; the others still work.

### US1. Send something during a call (sender)
> As a sender on a call with the recipient, I paste the secret, create the link, paste it in the
> call's chat and read out a few words, so the secret reaches only them without either of us
> thinking about channels or security settings.

Done when:
- after pasting the secret, the sender needs **one click** (Create link) before pasting into the chat;
- the link (or an invitation with the link) is **already copied** when the next screen appears;
- the passphrase is **words they can read aloud** without spelling anything: no capitals,
  symbols, digits or invented spellings;
- the screen says what to do next in that order: paste the link, say the words, keep the page open.

### US2. Receive something during a call (recipient)
> As a recipient on a call, I open the link from the chat, type the words I hear, and get what was
> sent, so I never need to understand how the tool works.

Done when:
- the page says in one line who this is from in plain terms ("Someone sent you something
  privately") and in one line what to do ("Type the words they tell you");
- the words must match **exactly**, one to one; because they're lowercase words separated by
  single spaces, typing what you hear is enough, and a mismatch says so plainly (US7);
- the page shows where it is (finding the sender, connecting, receiving) and what was received,
  with Copy or Download, then **Done**, which clears everything.

### US3. Send when you're not on a call (sender)
> As a sender who can't call, I send the link one way (email, chat) and the words another way
> (text message), and I know the recipient has to open it while my page is still open.

Done when:
- the waiting screen says, in one line, to send the words **another way** than the link, with an
  example, and offers the system share sheet for the link;
- the sender is told the delivery needs both of them online at once, with a suggestion: agree a
  time, or call.

### US4. Hand over to a phone next to you (sender)
> As a sender with the recipient in the room, I show a QR code their phone scans, and say the words.

Done when: a "Show QR code" action exists on the waiting screen (the earlier review's S2).

### US5. Check who's receiving (sender, optional)
> As a careful sender, I want to confirm that the person receiving is the one I'm talking to before
> anything is sent.

Done when: the option lives under **More options**, is off by default, and on the waiting screen
asks them to "Read your code to them. Does it match theirs?" before Deliver.

### US6. Keep the delivery alive on a phone (sender)
> As a sender on a phone, I'm told at the right moment that the page has to stay open, and I can
> keep the screen on with one tap.

Done when: the waiting screen includes it as a step (§4), not as a checkbox on the creation form.

### US7. When something goes wrong (both)
> As either person, when it fails I'm told plainly what happened and what to do.

Done when each failure has a plain message and one action:

| What happened | Recipient sees | Sender sees |
|---|---|---|
| Wrong words | "Those words didn't match. Check them with the sender and try again (N tries left)." | "Someone typed the wrong words (N of 5)." |
| Sender's page closed, or the link was already used | After a short wait: "The sender isn't there. Ask them to keep their page open, or to make a new link." | n/a |
| Too many wrong tries | "This link is locked. Ask the sender for a new one." | "Locked after 5 wrong tries. Create a new link." |
| No direct connection | The 0.9.0 connectivity work defines this | Same |

---

## 2. A passphrase you can say aloud

**Today:** a room passphrase is three bent common words with linking words, a two-digit number,
one random symbol between words and capitals (`ROOM_PHRASE`, `src/lib/passphrase.ts:303`), about
57 bits. Read aloud on a call it sounds like "capital S, stone, tilde, capital B, behind, tilde,
capital K, karrot with a K, ish…". The recipient has to type that exactly.

**It doesn't need to be complex.** Nothing an outsider can see depends on the passphrase, so
every guess is an online attempt, and the room locks after 5 wrong ones
([THREAT_MODEL.md](../THREAT_MODEL.md), `MAX_FAILURES` in `src/lib/room.ts:27`). Complexity
protects against offline guessing, which this design rules out.

**Proposal:**
- **Four common words, lowercase, separated by spaces**, from the existing list of 877 words
  (`src/lib/words.ts`): about 39 bits. With 5 tries, the chance of guessing it is about 1 in 100
  billion.
- **Exact match, one to one.** The words are not normalised: no case folding and no rewriting of
  spaces or separators, so what the recipient types must be exactly what the sender has (only
  leading and trailing spaces are ignored, as today). The simple format is what makes this easy:
  lowercase words and single spaces leave nothing to get wrong except the words themselves. Key
  derivation in [PROTOCOL.md](../PROTOCOL.md) stays as it is.
- **A word list fit for speaking:** drop words that sound like another word in the list
  (`night` / `knight`) and words people often misspell or mispronounce (e.g. `cello`). The
  room list becomes a curated subset; the password generator keeps the full list and its complex
  styles, because a password can face offline attacks.
- **Shown as separate words** on the sender's screen, large enough to read aloud, still masked by
  default with Show (people share their screen on calls).
- **Plain strength wording:** "Strong enough for this one-time link ✓", no bits on the main
  screen (S6). The meter only appears when someone edits the passphrase under More options.
- A **custom passphrase** stays possible under More options, with the conservative estimate it
  has today.

**One honest caveat for the guidance text:** on a call, the link (chat) and the words (voice) go
through the same calling app. That still protects against the usual leaks (a chat history read
later, a forwarded message, a shared mailbox), because the words aren't written anywhere. If the
calling app itself is the concern, send the link another way. This belongs in How it works, not on
the main screen.

---

## 3. Sender: creating the link

**Today** (`sendForm`, `src/tools/share.ts`), top to bottom: two lead paragraphs, the text box,
the drop zone, the passphrase field with ↻, a strength meter, two passphrase hints, the
"check who's receiving" checkbox with its explanation, the "keep the screen on" checkbox with
its explanation (and a warning when ticked), a hint about keeping the page open, the button, then
a "Which one should I use?" box with three bullet points. Roughly 300 words; on a phone the button
was already below the first screen in the earlier review (S3).

**Proposal:** one question, one button.

```
Secure Share
Send a password or a file privately. It goes straight to the other person
and works only once.                                        How it works ›

What do you want to send?
┌────────────────────────────────────────────┐
│ Paste a password, a note, a key…            │
└────────────────────────────────────────────┘
+ Add files

[ Create link ]                                   More options ▾

Several things to exchange, or a conversation? Use Secure Chat ›
```

- **The passphrase isn't on this page.** It's generated when the link is created and shown on
  the next screen, where it's used.
- **More options** (closed by default): "Choose my own words" (the passphrase field and meter),
  and "Check who's receiving before sending" (the S7 option).
- **Moved out:** the second lead paragraph and the "Which one should I use?" box go to How it
  works, leaving one line pointing to Secure Chat; the keep-the-page-open hint and the
  keep-the-screen-on option move to the waiting screen (§4).
- Drag and drop still works on the whole card; "Add files" is a 44 px tap target (A2).

### Copy the link automatically
When the link is created, copy it straight away and say so: "Link copied ✓ Paste it in your chat
with them." The usual "Copy" button stays, for a second copy or if automatic copying failed.

- **What's copied:** a short invitation, not the bare link, so the recipient knows what it is
  before clicking: *"I'm sending you something privately with CommonSec Share. Open this link,
  and I'll tell you the words: https://…"*. It never contains the passphrase. "Copy link only" is
  next to it.
- **Browser support:** copying needs a recent click, and creating the link takes a moment (key
  derivation). Start the clipboard write inside the click with a `ClipboardItem` whose content is a
  promise that resolves once the link exists (Safari and Chrome accept this), with
  `navigator.clipboard.writeText` as the fallback. If both fail, the screen says "Copy the link"
  instead of "Link copied". To verify on Chromium, Firefox and WebKit in the end-to-end tests.

---

## 4. Sender: waiting for the recipient

**Today** (`senderView`): the three-step progress list, the link (masked) with Copy, the
passphrase (masked) with Copy, a warning to keep the tab open, the screen-on note if it was
ticked, a "you left this page" note, the status and Cancel.

**Proposal:** the screen is the instructions, in the order they happen.

```
✓ 1  Link copied. Paste it in your chat with them.      [Copy again] [Share…] [QR]
  2  Tell them these words:   ••••  ••••  ••••  ••••     [Show]
  3  Keep this page open until they've got it.          [Keep my screen on]
     Waiting for them to open the link…
                                                         [Cancel]
```

- Steps tick as they happen: 1 when copied, 2 when the recipient connects, 3 when delivered.
- **Keep my screen on** is part of step 3, shown only where the browser supports it (Screen Wake
  Lock). It stays a choice, not automatic: an unlocked phone left alone exposes this page and
  everything else on it, which is why it was opt-in. The one-line caveat ("Don't leave your phone
  unattended") appears once it's on; it turns off by itself on delivery, as now.
- The link is shown as text only behind "Copy again", since it's already in the clipboard; the
  share sheet and QR code are secondary actions (S2).
- **Not on a call?** One line under step 2: "Not on a call? Send the words another way than the
  link, e.g. a text message." (US3)
- The "you left this page" warning and the tab title changes stay as they are.
- With "Check who's receiving" on, step 2 becomes "Read your code to them: **1234**. Does it match
  theirs?" with Deliver and Decline.

---

## 5. Recipient

**Today** (`receiveForm`, `receiverView`): the heading "Secure Share", one line ("Someone sent you
a one-time, end-to-end encrypted delivery."), a "Passphrase" field with a hint and a Receive
button. Then a single status line that changes, and the received text or files. After 20 s
without the sender: "Still looking. The sender's tab must be open. The link may have already been
used." The page never says who or what this is, what will happen, or what to do when it's done.

**Proposal:** a guided sequence, with plain words and no "passphrase".

```
Someone sent you something privately
It comes straight from their browser to yours, can be opened only once,
and isn't stored anywhere.                              How it works ›

1  Type the words they tell you
   ┌──────────────────────────────────┐
   │ e.g. four words                   │      [Show]
   └──────────────────────────────────┘
   [ Open ]

2  Connecting to the sender        (finding them → connected → receiving 40%)
3  Here's what they sent           [Show] [Copy]  /  file.pdf [Download]
4  [ Done ]  clears it from this page.     Send something back ›
```

- **Context and trust** (R1): one line saying what this is, one link to How it works and the
  source code. Nothing else above the field.
- **The field asks for "the words they tell you"**, must match exactly (§2), and
  says "usually four words" so people know roughly when they're done. The hint for the not-on-a-call case: "They
  should have sent them separately from the link."
- **Live stages** (R5): finding the sender, connected, receiving with a percentage. If the sender
  can't be found, the message says what to do (US7), and the 20 s wait keeps the current tone
  without "the tab must be open" jargon.
- **Done** (R4): clears the text and files from the page and returns to a short "All done" screen.
  "Send something back" opens a new share.
- The received text stays masked with Show, Copy and Clear (R2, done); the safety code is shown
  small, for people who compare it.
- The tab title stays "You've received a secure delivery" (R3, done).

---

## 6. Proposed roadmap items

Before the next release, in this order (G1 changes the words every other screen uses):

| # | Item | Covers |
|---|---|---|
| G1 | Speakable room passphrases: four lowercase words, a curated word list, exact match (no normalisation) | §2, S6 (Share) |
| G2 | One-question creation page: passphrase off the form, More options, Chat pointer in one line, How it works link | §3, S3 |
| G3 | Copy the invitation automatically on creation, with fallback; share sheet and QR code | §3, S2 |
| G4 | Guided waiting screen: numbered steps, Keep my screen on as a step, not-on-a-call line | §4, S1 follow-up |
| G5 | Guided recipient page: context, "type the words", live stages, Done and Send back | §5, R1, R4, R5 |

Each comes with end-to-end tests for its flow, and the axe-core checks keep running. Copy is
English-first; translations stay a later item.
