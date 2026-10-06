# Game Localization Console Utilities

Small browser-console utilities for checking a game's localization dictionary and reviewing translated strings in popups.

> **Private repository:** Keep this repository private when creating it on GitHub. These files are intended to run in the game's browser context and are not a standalone game or localization package.

## Utilities

- `localization-console-test.js` installs localization check and popup-review commands. It runs a translation check for the configured language when loaded.
- `Individual-Pop-up-per-Key.js` installs `showLocalizationPopupForKey` and immediately displays the default key as a quick smoke test.

Each file is standalone; use the one that matches your task.

## Requirements

- The game must be open in a browser, with its application scripts loaded.
- The browser console must have access to `MyApp.libs.Localization`, `languageData`, and the game's `$$.formatStr` / `$$.alert` functions.
- Language script URLs are loaded from `app/resources/languages/lang_<LanguageName>.js` relative to the current game URL when a language dictionary is not already loaded.

## Choose a language

Set the language before loading either utility:

```js
window.LOCALIZATION_TEST_LANGUAGE = "Hindi";
```

Use a language name, display name, or language code recognized by the game's `MyApp.libs.Localization.availableLanguages`. If the game does not expose that list, use the language name used by its `languageData` dictionary and language script filename (for example, `"English"`).

You can also pass a language directly to a command, without changing the default:

```js
await window.runLocalizationChecks("French");
```

## Run the localization checks

Paste the contents of `localization-console-test.js` into the game's browser console. It installs these commands and automatically runs a check for `LOCALIZATION_TEST_LANGUAGE` (Hindi by default):

```js
await window.runLocalizationChecks(); // Configured language
await window.runLocalizationChecks("French");
```

The report is returned by the function and stored in `window.__localizationTestReport`. It reports missing or extra keys, empty or unchanged translations, and placeholder mismatches against the English dictionary when available. A blocked run returns `{ ready: false, error: "..." }` and logs the reason.

## Review translations in popups

After loading `localization-console-test.js`, use:

```js
await window.showUntranslatedLocalizationPopups(); // Non-translated entries for configured language
await window.showUntranslatedLocalizationPopups("French");

await window.showLocalizationKeyPopups(); // Every key for configured language
await window.showLocalizationKeyPopups("French", ["General/LikeAppName"]);
await window.showLocalizationKeyPopups("French", ["General/LikeAppName", "Another/Key"]);
```

The all-keys review can open many popups. Close each popup to continue. Stop an active review with:

```js
window.stopLocalizationPopupReview();
```

The review restores the game's prior active language and localization dictionary when it completes or is stopped.

## Show one localization key

Paste the contents of `Individual-Pop-up-per-Key.js` into the game's browser console. By default, it displays `General/LikeAppName` for the configured language. To display another key or language:

```js
await window.showLocalizationPopupForKey(
    "General/LikeAppName",
    { count: 12, name: "TestUser", crew_label: " +3 MERCS" },
    "French"
);
```

The sample values are optional when using the default language:

```js
await window.showLocalizationPopupForKey("General/LikeAppName");
```

Unknown keys, unsupported languages, and unavailable game helpers are reported in the console rather than silently ignored.
