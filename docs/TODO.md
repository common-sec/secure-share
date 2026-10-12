# TODO

Small, independent improvements that don't need a roadmap feature of their own. They're picked
up between roadmap items, **highest priority first**. Each one ends with a commit, and a release
of one or more of them is a patch version (`0.X.Y`). Larger work goes through
[IDEAS.md](IDEAS.md) and the [roadmap](ROADMAP.md).

Legend: `[ ]` to do · `[x]` done (keep for one release, then remove).

## High priority: sending and receiving UX

From the [UX, product and SEO review](reviews/2026-10-12-ux-product-seo.md#2-ux-secure-share-the-main-flow).
**Goal:** a first-time sender or recipient, on a phone or a computer, understands what's
happening, trusts it, and succeeds.

### Sender
- [ ] **S1. Keep the phone awake while waiting.** Request a Screen Wake Lock until delivery; warn
      when the tab goes to the background; explain before creating the link that the page must
      stay open.
- [ ] **S2. Easier link sharing.** A "Send link…" button using the system share sheet (Web Share
      API); a QR code for handing the link to a phone nearby; "Copy invitation" text that reminds
      people to send the passphrase **another way**.
- [ ] **S3. Main action visible on a phone.** Shorter intro (details move to a "How it works"
      disclosure), a smaller default text area, and a sticky primary button on mobile.
- [ ] **S4. Waiting screen focus.** Hide the intro once the link exists; show only the steps and
      the status.
- [ ] **S5. Delivery signal when the tab isn't visible.** Update the tab title ("✓ Delivered");
      optionally a notification, if the user allows it.
- [ ] **S6. Plain-language strength.** "Strong enough for this room ✓" in place of "Fair · ≈57
      bits", with the bits as detail on demand. Same on the password page.
- [ ] **S7. Clearer approval option.** "Let me check who's receiving before sending (compare a
      code by phone)" in place of "Ask me before delivering".

### Recipient
- [ ] **R1. Context and trust.** Explain what this is, that it's open source (link to the code and
      How it works), what happens next, and that nothing is stored.
- [ ] **R2. Mask received secrets.** Hidden by default, with Show, Copy and "Clear from screen".
- [ ] **R3. Tab title.** "You've received a secure delivery" in place of "Share once".
- [ ] **R4. Next step after receiving.** "Send something back securely" (opens a new share) and
      "Done" (clears everything).
- [ ] **R5. Live connection stages.** Finding the sender → connecting → receiving %; after a
      timeout, actionable advice (ask the sender to keep the page open, try another network).

### Everywhere
- [ ] **A1. Labels.** Associate every visible label with its field (the message text area isn't).
- [ ] **A2. Tap targets ≥ 44 px.** Navigation, "choose files", inline links, the logo link.
- [ ] **A3. Status announcements.** `aria-live` on every status change (Share only partly has it).
- [ ] **A4. Focus and contrast.** Visible keyboard focus everywhere; check muted-text contrast in
      both themes.
- [ ] **P1. Plain language on the password page.** "Generated on your device. Nothing is sent
      anywhere." in place of "Generated locally with `crypto.getRandomValues`", with technical
      detail in a disclosure.

Where possible, each item comes with an end-to-end test (the axe-core accessibility checks
already run on every page).
