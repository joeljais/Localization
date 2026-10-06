# Contributing

Thanks for helping improve these localization utilities. Keep changes focused on making checks and popup reviews accurate, clear, and safe to use in the game's browser context.

## Before opening a change

- Keep each utility usable as a standalone browser-console script.
- Follow the existing JavaScript style: strict mode, descriptive names, and explicit console errors when a check cannot run.
- Do not add game credentials, private localization data, or unrelated game code.
- Update the README when a command, requirement, default, or user-visible behavior changes.

## Verify changes

There is no build or automated test suite in this repository. Verify changes in a permitted game/test environment:

1. Load the changed script in the browser console after the game has initialized.
2. Exercise the affected command with a known-good language and, where relevant, a supported alias/code.
3. Confirm the report or popup content is correct, errors are actionable, and popup reviews restore the game's original language and dictionary.
4. If changing popup review behavior, also verify that stopping a review closes the current popup and restores the original state.

Do not use a production client or data unless you are authorized to do so.
