# 🔄💰 בוט הבארטר והשירותים

בוט טלגרם מתקדם לפרסום ומציאת שירותים בבארטר ובתשלום, עם חיפוש חכם FTS5 ומערכת ניהול מודעות מלאה.

## ✨ תכונות עיקריות

### 📝 פרסום מודעות מתקדם
- **זרימת פרסום מלאה** - 7 שלבים עם validation
- **3 מצבי תמחור** - בארטר, תשלום, או שניהם
- **תמיכה בתגיות** - לחיפוש וקטגוריזציה טובים יותר
- **קישורים לתיק עבודות** - עם validation אוטומטי
- **פרטי קשר חכמים** - זיהוי אוטומטי של אימייל/טלפון/טלגרם

### 🔍 חיפוש מתקדם
- **FTS5 Full-Text Search** - חיפוש מהיר ומדויק בעברית ואנגלית
- **חיפוש בכותרות ותיאורים** - עם הדגשת מונחי חיפוש
- **סינון לפי תגיות** - חיפוש ממוקד יותר
- **סינון לפי מצב תמחור** - בארטר/תשלום/הכל

### 📱 דפדוף ותצוגה
- **דפדוף מסונן** - לפי קטגוריות תמחור
- **מודעות אחרונות** - עם מיון זמני
- **תצוגה מקצועית** - עיצוב נקי ומסודר בעברית
- **כפתורי פעולה** - צור קשר, שמור, דווח, שתף

### 👥 ניהול מודעות אישי
- **עריכת מודעות** - כל שדה בנפרד עם validation
- **הפעלה/הקפאה** - ללא מחיקה מוחלטת
- **מחיקה עם אישור** - הגנה מפני מחיקה בטעות
- **סטטיסטיקות מפורטות** - צפיות, פניות, שמירות

### 🛡️ אבטחה ותפעול
- **Rate Limiting** - הגנה מפני spam
- **מערכת דיווחים** - עם התראות למנהלים
- **Validation מלא** - לכל קלט משתמש
- **ניקוי אוטומטי** - מניעת דליפות זיכרון
- **לוגים מפורטים** - למעקב ובדיקות

## 🚀 התקנה מהירה

### דרישות מקדימות
- Node.js 18.0+ 
- npm או yarn
- חשבון טלגרם לקבלת טוקן בוט

### שלב 1: הורדה והתקנה
```bash
# שכפל את הפרויקט
git clone https://github.com/your-username/telegram-barter-bot.git
cd telegram-barter-bot

# התקן dependencies
npm install
```

### שלב 2: קבלת טוקן בוט
1. פתח שיחה עם [@BotFather](https://t.me/botfather) בטלגרם
2. שלח `/newbot`
3. בחר שם לבוט (דוגמא: "BarterBot")
4. בחר username (דוגמא: "my_barter_bot")
5. העתק את הטוקן שקיבלת

### שלב 3: הגדרת קובץ הסביבה
```bash
# צור קובץ .env בתיקיית הפרויקט
cp .env.example .env

# ערוך את .env והחלף את YOUR_BOT_TOKEN_HERE בטוקן שלך
nano .env
```

### שלב 4: אתחול בסיס הנתונים
```bash
# אתחל את SQLite עם FTS5
npm run init-db
```

### שלב 5: הפעלה
```bash
# הפעל את הבוט
npm start

# או במצב development עם auto-restart
npm run dev
```

## 📁 מבנה הפרויקט

```
telegram-barter-bot/
├── app.js              # קובץ הבוט הראשי
├── database.js         # מנהל בסיס הנתונים SQLite + FTS5
├── config.js           # מנהל הגדרות ו-validation
├── keyboard.js         # כל המקלדות והכפתורים
├── utils.js            # פונקציות עזר ו-validation
├── userHandler.js      # ניהול משתמשים ועריכת מודעות
├── package.json        # הגדרות npm ו-dependencies
├── .env               # משתני סביבה (טוקן, הגדרות)
├── .env.example       # תבנית קובץ סביבה
├── barter_bot.db      # בסיס נתונים SQLite (נוצר אוטומטית)
└── README.md          # התיעוד הזה
```

## 🔧 הגדרות מתקדמות

### קובץ .env - הגדרות עיקריות
```env
# טוכן הבוט (חובה!)
BOT_TOKEN=1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# הגדרות תוכן
MAX_TITLE_LENGTH=100
MAX_DESCRIPTION_LENGTH=1000
MAX_TAGS=10
MAX_SEARCH_RESULTS=10

# הגדרות מנהלים (רשימת User IDs)
ADMIN_USER_IDS=123456789,987654321

# מצב debug (true/false)
DEBUG_MODE=true
```

### Commands בpackage.json
```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js", 
    "init-db": "node database.js",
    "test": "node test.js"
  }
}
```

## 🌐 Deployment על Render

### אוטומטי (מומלץ)
1. צור חשבון ב-[Render](https://render.com)
2. חבר את הrepository שלך
3. צור Web Service חדש
4. הגדר Environment Variables (BOT_TOKEN)
5. Render יעשה deploy אוטומטי!

### ידני עם render.yaml
```yaml
services:
  - type: web
    name: telegram-barter-bot
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: BOT_TOKEN
        sync: false
      - key: NODE_ENV
        value: production
```

## 📊 מסד הנתונים

### טבלאות עיקריות
- **users** - פרטי משתמשים
- **posts** - מודעות עם כל השדות
- **posts_fts** - Virtual Table לחיפוש FTS5

### דוגמא לשאילתת חיפוש
```sql
-- חיפוש מודעות עם FTS5
SELECT p.*, u.username, u.first_name
FROM posts_fts f
JOIN posts p ON f.rowid = p.id
JOIN users u ON p.user_id = u.user_id  
WHERE posts_fts MATCH 'עיצוב OR גרפיקה'
AND p.is_active = 1
ORDER BY p.created_at DESC;
```

## 🎯 שימוש בבוט

### פקודות בסיסיות
- `/start` - תפריט ראשי וברכת פתיחה
- `/help` - מדריך שימוש מפורט

### תפריט ראשי
- **📝 פרסום שירות** - יצירת מודעה חדשה
- **🔍 חיפוש** - חיפוש מודעות לפי מילות מפתח
- **📱 דפדוף** - עיון במודעות אחרונות עם סינונים
- **📋 המודעות שלי** - ניהול מודעות אישי

### זרימת פרסום מודעה
1. **כותרת** - תיאור קצר של השירות
2. **תיאור מפורט** - פירוט השירות
3. **מצב תמחור** - בארטר/תשלום/שניהם  
4. **טווח מחיר** (אופציונלי) - למודעות בתשלום
5. **קישורים** (אופציונלי) - תיק עבודות, דף נחיתה
6. **פרטי קשר** - טלפון, אימייל, או טלגרם
7. **תגיות** (אופציונלי) - לשיפור החיפוש

### דוגמאות למודעות
```
🔄 עיצוב לוגו מקצועי

📄 אני מעצב גרפי עם 5 שנות ניסיון, מתמחה ביצירת לוגואים ייחודיים לעסקים קטנים.

💡 מצב תמחור: בארטר
🏷️ תגיות: עיצוב, לוגו, גרפיקה, ברנדינג
🔗 קישורים: https://myportfolio.com
📞 פרטי קשר: @designer_username

👤 מפרסם: יוסי
📅 פורסם: 25/08/2025
```

## 🔍 חיפוש מתקדם

### דוגמאות לחיפושים
- `עיצוב גרפי` - חיפוש במילים
- `#לוגו` - חיפוש בתגיות
- `פיתוח אתרים` - חיפוש ביטויים
- `תרגום אנגלית` - חיפוש ספציפי

### סינונים זמינים
- **לפי מצב תמחור** - בארטר בלבד, תשלום בלבד, או הכל
- **לפי תאריך** - מודעות אחרונות ראשונות
- **לפי תגיות** - קטגוריזציה מדויקת

## 🛠️ API פנימי

### דוגמאות לשימוש
```javascript
// חיפוש מודעות
const results = await db.searchPosts('עיצוב גרפי', { pricingMode: 'barter' });

// יצירת מודעה
const postId = await db.createPost({
    userId: 123456789,
    title: 'עיצוב לוגו',
    description: 'שירות עיצוב מקצועי',
    pricingMode: 'barter',
    tags: ['עיצוב', 'לוגו'],
    contactInfo: '@designer'
});

// validation של נתונים
const validation = utils.validateContact('designer@email.com');
// { isValid: true, type: 'email', formatted: 'designer@email.com' }
```

## 🐛 פתרון בעיות נפוצות

### שגיאת "BOT_TOKEN לא הוגדר"
```bash
# בדוק שקיים קובץ .env עם הטוכן
cat .env | grep BOT_TOKEN
```

### שגיאת "בסיס הנתונים לא נמצא"
```bash
# אתחל מחדש את בסיס הנתונים
npm run init-db
```

### הבוט לא מגיב להודעות
- בדוק שהטוכן תקין ואקטיבי
- וודא שהבוט לא פועל במקום אחר
- בדוק את הלוגים לשגיאות

### שגיאות חיפוש בעברית
- FTS5 תומך מלאית בעברית
- בדוק את encoding הקובץ (UTF-8)
- נסה חיפושים באנגלית לוודא שהבעיה בשפה

## 📈 סטטיסטיקות ומעקב

### מדדים זמינים
- **צפיות במודעות** - כמה פעמים צפו במודעה
- **פניות לפרטי קשר** - כמה פעמים צפו בפרטי קשר
- **שמירות** - כמה משתמשים שמרו את המודעה
- **דיווחים** - מעקב אחרי דיווחי spam

### לוגים
```
[2025-08-25T10:30:00.000Z] ℹ️ User 123456789 -> create_post {"title": "עיצוב לוגו"}
[2025-08-25T10:31:00.000Z] ℹ️ User 987654321 -> search {"query": "עיצוב", "resultsCount": 5}
[2025-08-25T10:32:00.000Z] ℹ️ User 456789123 -> view_contact {"postId": 1, "postOwner": 123456789}
```

## 🔐 אבטחה

### הגנות מובנות
- **Input Sanitization** - ניקוי כל קלט משתמש
- **Rate Limiting** - הגבלת פעולות לשעה
- **SQL Injection Protection** - שימוש ב-prepared statements
- **XSS Prevention** - escape של תווים מיוחדים
- **Access Control** - בדיקת הרשאות לכל פעולה

### הגדרות מנהלים
```env
# רשימת User IDs עם הרשאות מנהל
ADMIN_USER_IDS=123456789,987654321

# דרישה לאישור מודעות חדשות
POSTS_REQUIRE_APPROVAL=false
```

## 🤝 תרומה לפרויקט

אנחנו מזמינים תרומות! הנה איך תוכלו לעזור:

### דרכים לתרומה
1. **דיווח על באגים** - פתחו issue עם תיאור מפורט
2. **הצעות שיפור** - רעיונות לתכונות חדשות
3. **קוד** - Pull Requests עם שיפורים
4. **תיעוד** - שיפור הREADME והתיעוד
5. **תרגומים** - תמיכה בשפות נוספות

### הנחיות פיתוח
```bash
# פורק את הפרויקט
git fork https://github.com/original/telegram-barter-bot

# צור ענף חדש
git checkout -b feature/amazing-feature

# בצע שינויים וcommit
git commit -m "Add amazing feature"

# דחוף לענף
git push origin feature/amazing-feature

# פתח Pull Request
```

### Style Guide
- השתמשו בעברית בהודעות למשתמש
- השתמשו באנגלית בקוד ותגובות
- פעלו לפי ESLint configuration
- כתבו טסטים לתכונות חדשות

## 📞 תמיכה וקשר

### קישורים מועילים
- **תיעוד Telegram Bot API** - https://core.telegram.org/bots/api
- **SQLite FTS5 Documentation** - https://sqlite.org/fts5.html
- **Node.js Best Practices** - https://github.com/goldbergyoni/nodebestpractices

### קבלת עזרה
- **Issues** - לבעיות טכניות ופיצ'ר requests
- **Discussions** - לשאלות כלליות וחליפת רעיונות  
- **Email** - [your-email@domain.com](mailto:your-email@domain.com)
- **טלגרם** - [@your_username](https://t.me/your_username)

## 📄 רישיון

הפרויקט מורשה תחת [MIT License](LICENSE) - זה אומר שאתם חופשיים:
- ✅ להשתמש מסחרית
- ✅ לשנות ולהתאים
- ✅ להפיץ
- ✅ לשימוש פרטי

תנאי היחיד הוא לשמור על הודעת הרישיון המקורית.

## 🙏 תודות

תודה מיוחדת לכל התורמים והקהילה שעוזרים לשפר את הפרויקט:
- **Telegram Bot API Team** - על הAPI המעולה
- **SQLite Team** - על FTS5 שעובד מושלם בעברית  
- **Node.js Community** - על האקוסיסטם העשיר
- **כל הבטא טסטרים** - על הסבלנות והפידבק

---

## 🏁 סיכום

בוט הבארטר והשירותים מספק פתרון מלא ומקצועי לפרסום ומציאת שירותים בטלגרם. עם תכונות מתקדמות כמו חיפוש FTS5, עריכת מודעות, וסטטיסטיקות מפורטות, הבוט מתאים גם לקהילות קטנות וגם לפלטפורמות גדולות.

התחילו עכשיו וצרו קהילת בארטר משגשגת! 🚀

---
*עודכן לאחרונה: אוגוסט 2025*