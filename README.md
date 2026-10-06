# Game Localization QA Utilities

Browser-console tools for localization QA in the running game. They combine a dictionary audit with sequential in-game popup previews, manual QA verdicts, and a downloadable JSON report.

These scripts run inside the game's browser context; they are not a standalone app and cannot guarantee that a release has zero localization defects. The main script opens a separate QA window; automated checks catch dictionary and formatter issues, while testers review rendered text and record verdicts.

## Tools

| File | Purpose |
| --- | --- |
| [`localization-console-test.js`](./localization-console-test.js) | Main QA workflow: language selection, dictionary audit, folder/key popup review, manual verdicts, and report export |
| [`Individual-Pop-up-per-Key.js`](./Individual-Pop-up-per-Key.js) | Quick preview of one localization key |

## Requirements

- Open the game in a browser and wait for its application scripts to finish loading.
- The game page must expose `MyApp.libs.Localization`, `languageData`, `$$.formatStr`, and `$$.alert`.
- The page must be able to load its language scripts. A dictionary not already loaded is requested from `app/resources/languages/lang_<LanguageName>.js` relative to the current game URL. XLSX upload uses browser `DOMParser` and `DecompressionStream` support.
- Run these scripts only on the game or an authorized test environment.

## Quick start: recommended QA flow

1. Open the game's browser developer console.
2. Paste the full contents of `localization-console-test.js`. It adds a persistent **Open Localization QA** button to the game page and tries to open the QA controls in a separate browser window. If the browser blocks the window, allow pop-ups for the game and click the launcher, or run `window.showLocalizationQAPanel()`.
3. In the QA window, choose a supported language from **Language**. To verify the available choices in the console, use `window.listLocalizationLanguages()`. Do not assume a language exists: options depend on the game build.
4. Select your reference sheet under **Reference sheet**. The panel accepts `.xlsx` workbooks and `.csv` files. It accepts the supplied workbook layout: worksheet tabs as key namespaces, a `Keys` column, and language columns such as `German`. More generally, each worksheet/CSV needs a `Key`, `Keys`, or `Full Path Key` column and a translation column headed with the selected language name or code (for example, `German` or `de`). Workbook tabs are treated as key namespaces for bare keys; CSV keys should include the full path, such as `General/Loading Msg`.
5. Click **Test code fetching** to compare every row for the selected language against the live `$$.translate(key, defaultValue)` result, or **Run audit** to run that sheet comparison together with the dictionary audit. Blank expected sheet cells are checked against the in-code English fallback. Results name the uploaded sheet and report per-key mismatches. The game’s original language and dictionary are restored after testing.
6. Choose a folder from the **Folder** list and click **Review folder**. Use **Review all keys** or **Review flagged keys** for those workflows. The panel shows current key and progress as one game popup opens at a time.
7. While the current popup is visible, use the panel's **Pass**, **Fail**, **Blocked**, or **Needs review** buttons. Add an optional QA note first if helpful. Recording a verdict does not close the game popup; close it to advance to the next key. Merely viewing or closing a popup does not mark it as passed.
8. Click **QA summary** to see review coverage, or **Download report** to export the automated and manual results as JSON. Manual verdicts live in the current page session, so download the report before reloading or closing the game.

The separate QA window adapts to narrow/mobile screens with larger touch targets. On mobile browsers it may open as a separate tab. Keep the game page open while using the QA window because the localization APIs and review popups run in the game tab. The persistent game-page launcher can reopen the QA window at any time. **Hide window** closes only the QA window; it does not stop an active review or remove the launcher. **Stop review** closes the current review popup and restores the game's original language/dictionary. Reopen the QA window by clicking **Open Localization QA** or running `window.showLocalizationQAPanel()`. The console API remains available for scripted workflows.

## Other review options

Review only entries that are missing, empty (with a non-empty English fallback), or unchanged from English:

```js
await window.showUntranslatedLocalizationPopups();
```

Review selected keys or every key in the selected language and English baseline:

```js
await window.showLocalizationKeyPopups(undefined, "General/Loading Msg");
await window.showLocalizationKeyPopups(undefined, [
  "General/Loading Msg",
  "DynaConfMisc/User Properties"
]);
await window.showLocalizationKeyPopups(); // All baseline and locale keys
```

Review a folder once without changing the selected language:

```js
await window.showLocalizationFolderPopups("German", "DynaConfMisc");
```

The console helper can load a browser `File` selected by the user, then run only the uploaded-sheet check:

```js
const file = window.__localizationQAPanelControls.sheetInput.files[0];
await window.loadLocalizationSheet(file, "German");
await window.runLocalizationCodeFetchTest("German");
```

Run or repeat the full automated audit (requires a reference sheet for the code-fetch check):

```js
const report = await window.runLocalizationChecks();
report.failedKeys; // Keys with automated findings
```

Set a different default language at any time with `window.setLocalizationReviewLanguage("de")`. Popup review temporarily switches the game's localization dictionary and restores its previous language and dictionary when the review completes or is stopped.

## Understanding results

- **Missing:** present in the English baseline but absent from the selected language dictionary.
- **Empty:** present but blank. It is an automated finding when the English value is non-empty, because the game may display its fallback.
- **Unchanged:** non-empty selected-language text is identical to English. This is a manual-review warning, not an automated failure; product names or intentionally shared wording may be valid.
- **Placeholder mismatch:** placeholder names differ from the English contract.
- **Formatter failure:** the game's formatter threw, returned the wrong type, or left placeholders unresolved.
- **Manual verdict:** the tester's visual/game-context result. It is separate from automated findings.

For non-English reviews, the tool attempts to load English even when that dictionary was not already in memory. If it cannot load the baseline, the report includes the reason and its status is **INCOMPLETE** when no other failures were found; empty translations are still flagged for review. Missing/extra/unchanged comparisons cannot be conclusive without the baseline. Do not interpret an automated `PASS` as proof that translations are contextually correct, fit the UI, or have been visually verified. Use manual verdicts and the downloadable report as part of release QA.

## Preview one key

Load `Individual-Pop-up-per-Key.js` for the default sample preview, or call:

```js
await window.showLocalizationPopupForKey(
  "General/LikeAppName",
  { count: 12, name: "TestUser", crew_label: " +3 MERCS" },
  "German"
);
```

The quick-preview script selects the game's current language when available; otherwise it uses the first game-supported language. Unsupported languages, unknown keys, missing game helpers, and loading errors are reported in the console.

## Contributing and validation

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The main QA utility has a dependency-free Node.js smoke-test suite:

```sh
node --test localization-console-test.test.cjs
```

The tests simulate the game's browser APIs; final verification of real game rendering still requires an authorized game/test environment.
