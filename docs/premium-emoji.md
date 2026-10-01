# Premium emoji in the Telegram editor

Implemented on `serverless-cleanup`, using JavaScript and Telegram Serverless only.
No Mini App changes, new database tables, runtime npm dependencies, user-Premium
checks or global Fragment-username requirements are added.

## Workflow

Additional Tools → Premium Emoji → send `https://t.me/addemoji/PackName`.
The pack is fetched with `api.getStickerSet`, checked for `custom_emoji` type,
and stored as IDs plus Telegram's actual alternative emoji in the editor session.
Invalid links, unavailable packs and incomplete metadata stay retryable.

The main compact table has exactly three columns (choose, preview, HTML code)
and at most nine emoji rows. Selection is multi-select in selection order; tapping
again deselects. Its final rows are centered, three-column merged cells: Finish
Choosing (when nonempty), then Show More (when the pack has more than nine items).
Show More opens a separate Details block below the table. It starts at emoji ten
and pages through every remaining item, 18 at a time, with a visible range/total.
The first nine remain in the main table and are never repeated in Details.

Finish Choosing lists the current page blocks. Blocks with multiple text fields
(such as tables, lists and Details) offer a paginated field/cell chooser. Divider,
anchor, code and math content are not rich-text insertion targets. Code blocks
remain literal. Text fields and native media captions are supported.

The selected emoji initially appear at the end of the first Enter-delimited line
in a temporary block preview. A numbered emoji selector with ‹ / › chooses the
active emoji. Each emoji has its own independent position; the four direction
arrows move only the active emoji. Horizontal presses cross whole words, never
individual letters. Other selected emoji keep their word/line positions, even
when the active emoji crosses them. RichText wrappers, links and atomic emoji
remain intact. Vertical movement uses explicit newlines and word positions.
Horizontal movement uses the explicit page direction, or the line's first strong
letter when no direction was set. It follows logical text positions in that
base direction; it does not attempt to reconstruct Telegram's pixel-level bidi
layout for mixed-script runs. `Intl.Segmenter` supplies word boundaries, checked against safe grapheme
boundaries. V8 without ICU uses whitespace-delimited words and conservative
grapheme boundaries so compound sequences are not split. Punctuation and
whitespace do not require separate arrow presses.

Cancel leaves the draft untouched. Confirm commits the block and one undo
snapshot in the same session update. Redo is cleared. The ordinary Save button
remains the only way this feature's edits reach a saved page.

## Text and storage

Pasted complete `<tg-emoji emoji-id="ID">alternative</tg-emoji>` tags are converted
in the real Telegram input path, including list/table cells without message
entities. UTF-16 offsets of existing Telegram entities are remapped. Other
pasted HTML stays literal; existing Telegram text formatting is retained.
Copied code entities enclosing an emoji tag do not force the resulting emoji
into monospace. Malformed tags stay text. No arbitrary HTML execution is added.

Insertion updates the existing block storage fields. Imported native blocks
retain their native structure; editable derived fields are refreshed as well,
including nested child IDs. The last successfully loaded pack is cached in
`editor_sessions.premium_emoji_pack`, so reopening Premium Emoji in the same
editor session starts at the picker without asking for the link again. The
cache is cleared when a new `/editor` session is created and expires with the
normal 2-hour editor session; it is not included in saved pages. The temporary
workflow itself remains in `editor_sessions.addPayload`.

Callbacks validate private chat, current management message, session user, page
ownership, workflow stage and a rotating token. Per-user mutation locks reject
concurrent duplicates. The original target is checked before confirmation so a
stale preview cannot overwrite a changed block. The normal page limits apply.
Preview buttons originating in user content are made inert.

## Validation

Run with Node 24 (development/test use only):

```sh
npm run test:emoji
```

The dependency-free V8 harness runs the real feature, text conversion, rendering,
localization, session TTL and undo/redo modules; Telegram API and DB I/O are mocked.
Tests cover valid/invalid/unavailable packs, 300-emoji pagination, exact table
shape and callback lengths, copied HTML and Telegram entity offsets, Arabic and
English movement, combining marks/ZWJ/flags, native imported tables and Details,
media captions, multi-selection, independent emoji positions, word movement, active-emoji switching,
field selection, cancellation, confirmation,
JSON storage/reopen rendering, undo/redo, limits, expired/foreign/stale callbacks,
concurrent clicks and rendering failures. All 20 locale catalogs are checked.

Live `getStickerSet`, Telegram rendering/copy gestures, real Serverless storage
and bot publishing require a post-deployment smoke test; they were not exercised
by the mocked harness. Telegram's destination-specific custom-emoji permissions
and the existing publishing fallback continue to apply.

## Update and deploy

From the existing linked checkout, with local changes committed or stashed:

```sh
git fetch origin
git switch serverless-cleanup
git pull --ff-only origin serverless-cleanup
npm install
npm run test:emoji
npx tgcloud status
npx tgcloud diff
npx tgcloud migrate
npx tgcloud push
npx tgcloud webhook sync
```

The schema change adds the nullable `editor_sessions.premium_emoji_pack` column,
so run `npx tgcloud migrate` before the first deploy of this revision. Do not
run `tgcloud fetch` after pulling these code changes and before pushing: it can
replace local code with the currently deployed snapshot. Do not use a forced
Git update to discard local changes. Keep `.tgcloud/` and credentials out of
commits.

After deploy, test a real pack with more than nine entries, select emoji from
both tables, paste copied HTML into Arabic/English formatted text, move on two
Enter-separated lines, cancel, confirm, undo/redo, save/reopen, and publish to an
authorized private chat/group. Check the intended channel separately under its
own Telegram permissions.
