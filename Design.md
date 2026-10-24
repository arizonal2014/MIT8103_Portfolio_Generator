# Interface design

A quiet, practical workspace: warm off-white, charcoal text, one forest-green accent and fine dividers. No decorative cards, gradients or promotional hero. Keep copy short and the current action clear.

## Three steps

1. **Your details:** name, student ID, case study and filename preview. Validate before continuing.
2. **Build:** confirm the case, connection and GitHub saves. Show five activity states, a small spinner and real progress. Keep settings and the 19-step breakdown collapsed.
3. **Review & download:** summary and ZIP first, then the student's reflection. Group reports by portfolio; keep scripts, screenshots and logs collapsed.

## Typography and access

Use locally hosted IBM Plex Sans (400, 500, 600) and IBM Plex Mono (400), from IBM's official repository. Font source and SIL Open Font License are in public/fonts/. No remote font service is used.

Body and inputs: 17px. Labels and buttons: 16px. Supporting text: 14px. Desktop title: 38px; mobile: 30px. Provide visible keyboard focus, semantic headings, current-step navigation, labelled inputs, live status text and 44px minimum actions. Reduced-motion settings stop the spinner animation and transitions while retaining status text.

The interface presents the existing generator. UI changes must not start AI/database work during navigation, invent progress, clear saved runs or alter assessment results.
