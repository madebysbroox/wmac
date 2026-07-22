# UI Concept Mockups

Visual design explorations for making the Payment Tracker look more professional,
without sacrificing readability for the primary user (an 80-year-old, slow typist).

## How to view

Open `design-examples/index.html` in any browser — it's a gallery with live
previews and links to each full-screen concept. Or open a concept directly:

- `concept-aurora.html` — **Aurora**: modern SaaS dashboard, dark left nav rail, indigo accent (Home screen)
- `concept-dojo.html` — **Heritage Dojo**: premium navy + bronze, brand-forward (Member detail screen)
- `concept-calm.html` — **Calm Clarity**: accessibility-first, extra-large targets, soft teal (Home + member list)

These are **static HTML/CSS mockups with sample data**. They do not import or
touch the real app code (`index.html`, `src/`) or any saved data — they're safe
to open, edit, and throw away.

## What stays the same in every concept

- Bilingual Korean-first / English labels
- The three-state calm color coding (paid / needs attention / behind)
- Large text and big click targets
- The same daily workflow: find a member → click → mark paid → done

## Next step

Pick one direction (or mix elements across them) and the chosen look can be
applied to the production `index.html` and `src/styles.css`. Segoe UI (the
native Windows font) is used throughout, with Korean fonts falling back
automatically.
