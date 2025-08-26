# מצב הפרויקט (CI, בדיקות, קוד)

## מה בוצע עכשיו
- CI ב־GitHub Actions (`.github/workflows/ci.yml`): מטריצה Node 18.x/20.x/22.x, cache ל־npm, `npm ci`, `npm run init-db` עם `DATABASE_PATH` זמני, `npm run smoke`, `npm audit --audit-level=high || true`, ולינט לא־חוסם (`npm run lint || true`).
- Smoke test: `scripts/smoke.js` — יצירת user+post → חיפוש → שמירה/הסרה → סגירה.
- ESLint/Prettier (אזהרות בלבד): קבצים `.eslintrc.cjs`, `.eslintignore`, `.prettierrc.json`, `.prettierignore`; סקריפטים `npm run lint`, `npm run format`; devDependencies `eslint`, `prettier`, `eslint-config-prettier`; בוצע Prettier ותיקונים אוטומטיים בטוחים.
- עדכוני קוד קטנים ובטוחים: סוגריים ב־`switch` במקומות רלוונטיים, שימוש ב־`Object.prototype.hasOwnProperty.call`, השתקות נקודתיות ל־`no-useless-escape`, העברת `userId` ל־`handleSearch`, ותיקון שימוש ב־`callbackQuery.id`.

## איך להריץ מקומית
- לינט: `npm run lint`
- עיצוב קוד: `npm run format`
- Smoke: `npm run smoke` (אפשר להגדיר `DATABASE_PATH` זמני)

## מה נותר (הצעות)
- בדיקות יחידה ל־`utils.js` (Jest/Vitest)
- פיצול `app.js` לשכבות (handlers/services); `database.js` נשאר שכבת גישה
- שיפור הדרגתי של אזהרות ESLint (לא חוסם בשלב זה): `no-undef`/`no-unused-vars` נקודתיים, `no-async-promise-executor`
- מדיניות GitHub (אם תרצה): Required checks, Require review, Require up-to-date

## עדכוני תלויות אוטומטיים — מומלץ?
מומלץ ברוב הריפוזיטוריז אם ה־CI יציב. ברירת מחדל טובה: עדכון שבועי, הגבלת PRs פתוחים, בלי מיזוג אוטומטי ל־Major.

### אפשרויות
- Dependabot (GitHub): `.github/dependabot.yml`
- Renovate (גמיש יותר): `renovate.json`

דוגמה מינימלית ל־Dependabot:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

המלצות:
- ריצה שבועית (ראשון לפנות בוקר), limit 3–5 PRs
- מיזוג אוטומטי ל־devDependencies ו־patch/minor בלבד; Major בבדיקה ידנית
- להשאיר לינט לא־חוסם בשלב זה ולוודא שה־smoke ירוק לפני מיזוג