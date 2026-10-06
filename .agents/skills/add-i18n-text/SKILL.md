---
name: add-i18n-text
description: >-
  Use this skill when adding, modifying, or deleting user-facing strings or translation keys across English, Vietnamese, and Japanese locales.
---

# Runbook: Adding / Modifying Multilingual UI Strings (i18n Text)

All user-facing strings must be localized across 3 languages: English (`en`), Vietnamese (`vi`), and Japanese (`ja`).
The test suite `tests/renderer/i18n.test.ts` automatically enforces strict parity across key structures and interpolation variables.

---

## Step 1: Define a Semantic Key

Choose an appropriate namespace within the JSON hierarchy matching the feature:

- `common`: Reusable labels (OK, Cancel, Close, Save, Error, Loading...).
- `nav`: Left navigation sidebar menu items.
- `backup`: Strings dedicated to the Beatmap Backup screen.
- `download`: Strings dedicated to the Download Manager and Queue.
- `filter`: Search criteria, rating categories, and game modes.
- `settings`: Application configuration, paths, mirror management, diagnostics.

For example, to add a "Clear Cache" button within Database Settings:
The key would be: `settings.database.clear_cache_btn`.

---

## Step 2: Concurrently Update All 3 Locale Files

Open all 3 files under `src/renderer/src/i18n/locales/`:

1. **`en.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "Clear Cache",
       "clear_cache_desc": "Remove temporary database cache files ({size} MB)."
     }
   }
   ```
2. **`vi.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "Xóa bộ nhớ đệm",
       "clear_cache_desc": "Xóa các tệp đệm cơ sở dữ liệu tạm thời ({size} MB)."
     }
   }
   ```
3. **`ja.json`**:
   ```json
   "settings": {
     "database": {
       "clear_cache_btn": "キャッシュをクリア",
       "clear_cache_desc": "一時的なデータベースキャッシュファイルを削除します（{size} MB）。"
     }
   }
   ```

> [!CAUTION]
> **Strict Placeholder Rule**:
> If `{size}` appears in the English string, both Vietnamese and Japanese strings **must retain the exact placeholder name `{size}`**. Never translate placeholder names (e.g., do not rename to `{dung_luong}`).

---

## Step 3: Implement in Vue Components

### In `<template>`:

```html
<v-btn color="primary"> {{ $t('settings.database.clear_cache_btn') }} </v-btn>

<p>{{ $t('settings.database.clear_cache_desc', { size: cacheSizeMb }) }}</p>
```

### In `<script setup lang="ts">`:

```ts
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const handleSuccess = (): void => {
  const message = t('settings.database.clear_cache_btn')
  // ...
}
```

---

## Step 4: Verification Check

Execute the dedicated i18n test suite:

```powershell
npx vitest run tests/renderer/i18n.test.ts
```

The test asserts three invariants:

1. `en`, `vi`, and `ja` contain identical key sets (100% parity).
2. No translation key contains an empty string (`""`).
3. All interpolation placeholders `{variable}` match across all 3 locale dictionaries.

Passing this test confirms your translation additions are properly integrated and regression-free.
