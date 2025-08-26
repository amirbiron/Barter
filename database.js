const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// נתיב לבסיס הנתונים
const getDatabasePath = () => {
    // אם יש משתנה סביבה מפורש, השתמש בו
    if (process.env.DATABASE_PATH) {
        console.log(`📁 משתמש בנתיב מוגדר: ${process.env.DATABASE_PATH}`);
        return process.env.DATABASE_PATH;
    }
    
    // אם אנחנו ב-Render
    if (process.env.RENDER) {
        // נסה קודם את הדיסק המתמיד
        const persistentPath = '/opt/render/project/data';
        try {
            // יצור את התיקייה אם לא קיימת
            if (!fs.existsSync(persistentPath)) {
                fs.mkdirSync(persistentPath, { recursive: true });
                console.log('📁 נוצרה תיקיית דיסק מתמיד');
            }
            
            // בדוק הרשאות כתיבה
            fs.accessSync(persistentPath, fs.constants.W_OK);
            console.log('📁 Render: משתמש בדיסק מתמיד');
            return path.join(persistentPath, 'barter_bot.db');
        } catch (err) {
            console.log('⚠️ אין הרשאות כתיבה לדיסק המתמיד:', err.message);
            
            // אם אין הרשאות, השתמש ב-/tmp
            console.log('📁 Render: משתמש בתיקיית /tmp (זמני - יימחק בכל deploy!)');
            const tmpDir = '/tmp/barter_bot_data';
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            return path.join(tmpDir, 'barter_bot.db');
        }
    }
    
    // ברירת מחדל - תיקייה מקומית
    console.log('📁 משתמש בתיקייה מקומית');
    return path.join(__dirname, 'barter_bot.db');
};

const DB_PATH = getDatabasePath();
console.log(`💾 נתיב מסד הנתונים: ${DB_PATH}`);

class Database {
    constructor() {
        // פתיחת מסד הנתונים
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ שגיאה בפתיחת בסיס הנתונים:', err.message);
                console.error('נתיב:', DB_PATH);
                
                // אם הבעיה היא הרשאות, נסה ליצור קובץ חדש
                if (err.code === 'SQLITE_READONLY' || err.code === 'SQLITE_CANTOPEN') {
                    console.log('🔄 מנסה ליצור מסד נתונים חדש...');
                    // וודא שהתיקייה קיימת
                    const dir = path.dirname(DB_PATH);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    // נסה שוב
                    this.db = new sqlite3.Database(DB_PATH, (err2) => {
                        if (err2) {
                            console.error('❌ נכשל גם בניסיון השני:', err2.message);
                            process.exit(1);
                        } else {
                            console.log('✅ מסד נתונים חדש נוצר בהצלחה');
                            this.init();
                        }
                    });
                } else {
                    process.exit(1);
                }
            } else {
                console.log('✅ התחברות מוצלחת לבסיס הנתונים');
                this.init();
            }
        });
    }

    // יצירת הטבלאות
    async init() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`PRAGMA foreign_keys = ON`);
                // טבלת משתמשים
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        user_id INTEGER PRIMARY KEY,
                        username TEXT,
                        first_name TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1
                    )
                `);

                // טבלת מודעות
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS posts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        pricing_mode TEXT CHECK(pricing_mode IN ('barter', 'payment', 'both', 'free')) NOT NULL,
                        price_range TEXT,
                        portfolio_links TEXT,
                        contact_info TEXT NOT NULL,
                        tags TEXT, -- JSON string של מערך תגיות
                        visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1,
                        FOREIGN KEY (user_id) REFERENCES users (user_id)
                    )
                `);

                // Migration: הוספת עמודת visibility לטבלה קיימת
                this.db.run(`
                    ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public'
                `, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                        console.log('⚠️ לא ניתן להוסיף עמודת visibility (כנראה כבר קיימת)');
                    } else if (!err) {
                        console.log('✅ עמודת visibility נוספה לטבלת posts');
                    }
                });

                // טבלת FTS5 לחיפוש מהיר (Virtual Table)
                this.db.run(`
                    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
                        title,
                        description,
                        tags,
                        content='posts',
                        content_rowid='id'
                    )
                `);

                // טריגרים לעדכון FTS5 אוטומטי
                this.db.run(`
                    CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
                        INSERT INTO posts_fts(rowid, title, description, tags) 
                        VALUES (NEW.id, NEW.title, NEW.description, NEW.tags);
                    END
                `);

                this.db.run(`
                    CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
                        INSERT INTO posts_fts(posts_fts, rowid, title, description, tags) 
                        VALUES('delete', OLD.id, OLD.title, OLD.description, OLD.tags);
                    END
                `);

                this.db.run(`
                    CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
                        INSERT INTO posts_fts(posts_fts, rowid, title, description, tags) 
                        VALUES('delete', OLD.id, OLD.title, OLD.description, OLD.tags);
                        INSERT INTO posts_fts(rowid, title, description, tags) 
                        VALUES (NEW.id, NEW.title, NEW.description, NEW.tags);
                    END
                `);

                // טבלת מועדפים - שמירת מודעות למשתמשים
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS saved_posts (
                        user_id INTEGER NOT NULL,
                        post_id INTEGER NOT NULL,
                        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, post_id),
                        FOREIGN KEY (user_id) REFERENCES users (user_id),
                        FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
                    )
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת טבלת saved_posts:', err);
                    }
                });

                // אינדקס לשיפור ביצועים
                this.db.run(`
                    CREATE INDEX IF NOT EXISTS idx_saved_posts_user 
                    ON saved_posts(user_id)
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת אינדקס:', err);
                    }
                });

                // טבלת מילות מפתח להתראות
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS keyword_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        keyword TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1,
                        FOREIGN KEY (user_id) REFERENCES users (user_id),
                        UNIQUE(user_id, keyword)
                    )
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת טבלת keyword_alerts:', err);
                    }
                });

                // טבלת היסטוריית התראות שנשלחו
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS sent_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        post_id INTEGER NOT NULL,
                        keyword TEXT NOT NULL,
                        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users (user_id),
                        FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
                        UNIQUE(user_id, post_id, keyword)
                    )
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת טבלת sent_alerts:', err);
                    }
                });

                // אינדקסים לשיפור ביצועים
                this.db.run(`
                    CREATE INDEX IF NOT EXISTS idx_keyword_alerts_user 
                    ON keyword_alerts(user_id)
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת אינדקס keyword_alerts:', err);
                    }
                });

                this.db.run(`
                    CREATE INDEX IF NOT EXISTS idx_sent_alerts_user_post 
                    ON sent_alerts(user_id, post_id)
                `, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.error('שגיאה ביצירת אינדקס sent_alerts:', err);
                    }
                });

                console.log('✅ בסיס הנתונים הוכן בהצלחה');
                resolve();
            });
        });
    }

    // הוספת/עדכון משתמש
    upsertUser(userId, username, firstName) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO users (user_id, username, first_name, created_at)
                VALUES (?, ?, ?, COALESCE((SELECT created_at FROM users WHERE user_id = ?), CURRENT_TIMESTAMP))
            `;
            this.db.run(sql, [userId, username, firstName, userId], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    // יצירת מודעה חדשה
    createPost(postData) {
        return new Promise((resolve, reject) => {
            const { userId, title, description, pricingMode, priceRange, portfolioLinks, contactInfo, tags, visibility } = postData;
            const tagsJson = JSON.stringify(tags || []);
            const postVisibility = visibility || 'public'; // ברירת מחדל: ציבורי
            
            const sql = `
                INSERT INTO posts (user_id, title, description, pricing_mode, price_range, portfolio_links, contact_info, tags, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [userId, title, description, pricingMode, priceRange, portfolioLinks, contactInfo, tagsJson, postVisibility], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    // חיפוש בכותרות בלבד
    searchPostsByTitle(query, filters = {}) {
        console.log(`📌 searchPostsByTitle נקראת עם query: "${query}", filters:`, filters);
        
        return new Promise((resolve, reject) => {
            let sql, params;
            
            if (query && query.trim()) {
                // חיפוש בכותרות בלבד עם LIKE - מסנן מודעות פרטיות
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts p
                    JOIN users u ON p.user_id = u.user_id
                    WHERE p.title LIKE ? AND p.is_active = 1
                    AND p.visibility = 'public'
                `;
                params = [`%${query}%`];
                console.log(`📌 חיפוש בכותרות: "${query}"`);
                
                // הוספת סינונים
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
                
            } else {
                // אם אין חיפוש טקסט, הצג את כל המודעות הציבוריות
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts p
                    JOIN users u ON p.user_id = u.user_id
                    WHERE p.is_active = 1
                    AND p.visibility = 'public'
                `;
                params = [];
                console.log('📌 אין query - מחזיר את כל המודעות הציבוריות');
                
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
            }
            
            sql += ` ORDER BY p.created_at DESC LIMIT 20`;
            
            console.log('🔧 SQL query:', sql.replace(/\s+/g, ' ').trim());
            console.log('🔧 Parameters:', params);
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ שגיאת מסד נתונים בחיפוש כותרות:', err);
                    reject(err);
                } else {
                    console.log(`✅ נמצאו ${rows.length} תוצאות`);
                    // המרת JSON strings חזרה למערכים
                    const results = rows.map(row => ({
                        ...row,
                        tags: JSON.parse(row.tags || '[]')
                    }));
                    resolve(results);
                }
            });
        });
    }

    // חיפוש מודעות (FTS5)
    searchPosts(query, filters = {}) {
        console.log(`🔍 searchPosts נקראת עם query: "${query}", filters:`, filters);
        
        return new Promise((resolve, reject) => {
            let sql, params;
            
            if (query && query.trim()) {
                // חיפוש טקסט חופשי עם FTS5 - מסנן מודעות פרטיות
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts_fts f
                    JOIN posts p ON f.rowid = p.id
                    JOIN users u ON p.user_id = u.user_id
                    WHERE posts_fts MATCH ? AND p.is_active = 1
                    AND p.visibility = 'public'
                `;
                params = [query];
                console.log(`📊 משתמש ב-FTS5 לחיפוש: "${query}"`);
                
                // הוספת סינונים
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
                
            } else {
                // אם אין חיפוש טקסט, הצג את כל המודעות הציבוריות
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts p
                    JOIN users u ON p.user_id = u.user_id
                    WHERE p.is_active = 1
                    AND p.visibility = 'public'
                `;
                params = [];
                console.log('📊 אין query - מחזיר את כל המודעות הציבוריות');
                
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
            }
            
            sql += ` ORDER BY p.created_at DESC LIMIT 20`;
            
            console.log('🔧 SQL query:', sql.replace(/\s+/g, ' ').trim());
            console.log('🔧 Parameters:', params);
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ שגיאת מסד נתונים בחיפוש:', err);
                    reject(err);
                } else {
                    console.log(`✅ נמצאו ${rows.length} תוצאות`);
                    // המרת JSON strings חזרה למערכים
                    const results = rows.map(row => ({
                        ...row,
                        tags: JSON.parse(row.tags || '[]')
                    }));
                    resolve(results);
                }
            });
        });
    }

    // קבלת מודעות משתמש ספציפי
    getUserPosts(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM posts 
                WHERE user_id = ?
                ORDER BY created_at DESC
            `;
            
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    console.error('[DEBUG] Error getting user posts:', err);
                    reject(err);
                } else {
                    console.log(`[DEBUG] getUserPosts for user ${userId} - found ${rows?.length || 0} posts`);
                    if (rows) {
                        rows.forEach(post => {
                            console.log(`[DEBUG] Post ${post.id}: active=${post.is_active}, title="${post.title}"`);
                        });
                    }
                    
                    const results = (rows || []).map(row => ({
                        ...row,
                        tags: JSON.parse(row.tags || '[]')
                    }));
                    resolve(results);
                }
            });
        });
    }

    // מחיקת מודעה (soft delete)
    deletePost(postId, userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM posts 
                WHERE id = ? AND user_id = ?
            `;
            this.db.run(sql, [postId, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
        });
    }

    // מחיקת מודעה על ידי מנהל (ללא בדיקת בעלות)
    adminDeletePost(postId) {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM posts 
                WHERE id = ?
            `;
            this.db.run(sql, [postId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
        });
    }

    // הפעלה/הקפאה של מודעה
    togglePost(postId, userId) {
        return new Promise((resolve, reject) => {
            console.log(`[DEBUG] togglePost called - postId: ${postId}, userId: ${userId}`);
            
            const db = this.db; // שומר את הרפרנס
            
            // קודם נבדוק מה המצב הנוכחי
            db.get('SELECT is_active FROM posts WHERE id = ? AND user_id = ?', [postId, userId], (err, row) => {
                if (err) {
                    console.error('[DEBUG] Error checking post status:', err);
                    reject(err);
                    return;
                }
                
                console.log(`[DEBUG] Current post status:`, row);
                
                // עכשיו נעדכן
                const sql = `
                    UPDATE posts 
                    SET is_active = 1 - is_active, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND user_id = ?
                `;
                
                db.run(sql, [postId, userId], function(err) {
                    if (err) {
                        console.error('[DEBUG] Error toggling post:', err);
                        reject(err);
                    } else {
                        const changes = this.changes;
                        console.log(`[DEBUG] Toggle result - changes: ${changes}`);
                        
                        // בדיקה אחרי העדכון
                        db.get('SELECT id, is_active FROM posts WHERE id = ?', [postId], (err2, row2) => {
                            console.log(`[DEBUG] Post after toggle:`, row2);
                        });
                        
                        resolve(changes > 0);
                    }
                });
            });
        });
    }

    // קבלת מודעה יחידה
    getPost(postId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT p.*, u.username, u.first_name
                FROM posts p
                JOIN users u ON p.user_id = u.user_id
                WHERE p.id = ?
            `;
            this.db.get(sql, [postId], (err, row) => {
                if (err) reject(err);
                else if (row) {
                    resolve({
                        ...row,
                        tags: JSON.parse(row.tags || '[]')
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // קבלת מודעות אחרונות
    getRecentPosts(limit = 10, filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT p.*, u.username, u.first_name
                FROM posts p
                JOIN users u ON p.user_id = u.user_id
                WHERE p.is_active = 1
            `;
            
            if (filters.pricingMode) {
                sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
            }
            
            sql += ` ORDER BY p.created_at DESC LIMIT ?`;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) reject(err);
                else {
                    const results = rows.map(row => ({
                        ...row,
                        tags: JSON.parse(row.tags || '[]')
                    }));
                    resolve(results);
                }
            });
        });
    }

    // פונקציות ניהול מועדפים
    
    // שמירת מודעה למועדפים
    savePost(userId, postId) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR IGNORE INTO saved_posts (user_id, post_id)
                VALUES (?, ?)
            `;
            this.db.run(sql, [userId, postId], function(err) {
                if (err) {
                    console.error('[DEBUG] Error saving post:', err);
                    reject(err);
                } else {
                    console.log(`[DEBUG] savePost - changes: ${this.changes}`);
                    resolve({ saved: this.changes > 0 });
                }
            });
        });
    }

    // הסרת מודעה מהמועדפים
    unsavePost(userId, postId) {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM saved_posts 
                WHERE user_id = ? AND post_id = ?
            `;
            this.db.run(sql, [userId, postId], function(err) {
                if (err) {
                    console.error('[DEBUG] Error unsaving post:', err);
                    reject(err);
                } else {
                    console.log(`[DEBUG] unsavePost - changes: ${this.changes}`);
                    resolve({ removed: this.changes > 0 });
                }
            });
        });
    }

    // בדיקה אם מודעה שמורה
    isPostSaved(userId, postId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT COUNT(*) as count 
                FROM saved_posts 
                WHERE user_id = ? AND post_id = ?
            `;
            this.db.get(sql, [userId, postId], (err, row) => {
                if (err) {
                    console.error('[DEBUG] Error checking if post saved:', err);
                    reject(err);
                } else {
                    console.log(`[DEBUG] isPostSaved - userId: ${userId}, postId: ${postId}, count: ${row.count}`);
                    resolve(row.count > 0);
                }
            });
        });
    }

    // קבלת כל המודעות השמורות של משתמש
    getSavedPosts(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT p.*, sp.saved_at
                FROM posts p
                INNER JOIN saved_posts sp ON p.id = sp.post_id
                WHERE sp.user_id = ? AND p.is_active = 1
                ORDER BY sp.saved_at DESC
            `;
            this.db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ספירת מודעות שמורות
    countSavedPosts(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT COUNT(*) as count 
                FROM saved_posts sp
                INNER JOIN posts p ON p.id = sp.post_id
                WHERE sp.user_id = ? AND p.is_active = 1
            `;
            this.db.get(sql, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    // ===============================================
    // 🔔 ניהול מילות מפתח להתראות
    // ===============================================

    // הוספת מילת מפתח למשתמש
    addKeywordAlert(userId, keyword) {
        return new Promise((resolve, reject) => {
            const normalizedKeyword = keyword.trim().toLowerCase();
            const sql = `
                INSERT OR IGNORE INTO keyword_alerts (user_id, keyword) 
                VALUES (?, ?)
            `;
            this.db.run(sql, [userId, normalizedKeyword], function(err) {
                if (err) {
                    console.error('שגיאה בהוספת מילת מפתח:', err);
                    reject(err);
                } else {
                    resolve({ 
                        success: this.changes > 0,
                        id: this.lastID,
                        message: this.changes > 0 ? 'מילת המפתח נוספה בהצלחה' : 'מילת המפתח כבר קיימת'
                    });
                }
            });
        });
    }

    // הסרת מילת מפתח של משתמש
    removeKeywordAlert(userId, keyword) {
        return new Promise((resolve, reject) => {
            const normalizedKeyword = keyword.trim().toLowerCase();
            const sql = `
                DELETE FROM keyword_alerts 
                WHERE user_id = ? AND keyword = ?
            `;
            this.db.run(sql, [userId, normalizedKeyword], function(err) {
                if (err) {
                    console.error('שגיאה בהסרת מילת מפתח:', err);
                    reject(err);
                } else {
                    resolve({ 
                        success: this.changes > 0,
                        message: this.changes > 0 ? 'מילת המפתח הוסרה בהצלחה' : 'מילת המפתח לא נמצאה'
                    });
                }
            });
        });
    }

    // קבלת כל מילות המפתח של משתמש
    getUserKeywords(userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT keyword, created_at, is_active 
                FROM keyword_alerts 
                WHERE user_id = ? AND is_active = 1
                ORDER BY created_at DESC
            `;
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    console.error('שגיאה בקבלת מילות מפתח:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // בדיקה האם מודעה מכילה מילות מפתח של משתמשים
    checkPostForKeywords(postId, postTitle, postDescription) {
        return new Promise((resolve, reject) => {
            const postText = `${postTitle} ${postDescription}`.toLowerCase();
            
            const sql = `
                SELECT DISTINCT ka.user_id, ka.keyword
                FROM keyword_alerts ka
                WHERE ka.is_active = 1
                AND ka.user_id != (SELECT user_id FROM posts WHERE id = ?)
                AND NOT EXISTS (
                    SELECT 1 FROM sent_alerts sa 
                    WHERE sa.user_id = ka.user_id 
                    AND sa.post_id = ? 
                    AND sa.keyword = ka.keyword
                )
            `;
            
            this.db.all(sql, [postId, postId], (err, rows) => {
                if (err) {
                    console.error('שגיאה בבדיקת מילות מפתח:', err);
                    reject(err);
                } else {
                    // סינון מילות מפתח שנמצאות בטקסט
                    const matches = rows.filter(row => 
                        postText.includes(row.keyword.toLowerCase())
                    );
                    resolve(matches);
                }
            });
        });
    }

    // רישום התראה שנשלחה
    recordSentAlert(userId, postId, keyword) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR IGNORE INTO sent_alerts (user_id, post_id, keyword) 
                VALUES (?, ?, ?)
            `;
            this.db.run(sql, [userId, postId, keyword], function(err) {
                if (err) {
                    console.error('שגיאה ברישום התראה:', err);
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            });
        });
    }

    // ניקוי התראות ישנות (אופציונלי - למחוק התראות ישנות מ-30 יום)
    cleanOldAlerts() {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM sent_alerts 
                WHERE sent_at < datetime('now', '-30 days')
            `;
            this.db.run(sql, function(err) {
                if (err) {
                    console.error('שגיאה בניקוי התראות ישנות:', err);
                    reject(err);
                } else {
                    resolve({ deleted: this.changes });
                }
            });
        });
    }

    // החלפת כל מילות המפתח של משתמש
    setUserKeywords(userId, keywords) {
        return new Promise(async (resolve, reject) => {
            try {
                // התחל טרנזקציה
                await new Promise((res, rej) => {
                    this.db.run('BEGIN TRANSACTION', err => err ? rej(err) : res());
                });

                // מחק את כל מילות המפתח הקיימות
                await new Promise((res, rej) => {
                    this.db.run('DELETE FROM keyword_alerts WHERE user_id = ?', [userId], err => err ? rej(err) : res());
                });

                // הוסף את מילות המפתח החדשות
                for (const keyword of keywords) {
                    const normalizedKeyword = keyword.trim().toLowerCase();
                    if (normalizedKeyword) {
                        await new Promise((res, rej) => {
                            this.db.run(
                                'INSERT INTO keyword_alerts (user_id, keyword) VALUES (?, ?)',
                                [userId, normalizedKeyword],
                                err => err ? rej(err) : res()
                            );
                        });
                    }
                }

                // סיים את הטרנזקציה
                await new Promise((res, rej) => {
                    this.db.run('COMMIT', err => err ? rej(err) : res());
                });

                resolve({ success: true, count: keywords.length });
            } catch (error) {
                // בטל את הטרנזקציה במקרה של שגיאה
                await new Promise((res, rej) => {
                    this.db.run('ROLLBACK', () => res());
                });
                console.error('שגיאה בהגדרת מילות מפתח:', error);
                reject(error);
            }
        });
    }

    // סגירת החיבור
    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('שגיאה בסגירת בסיס הנתונים:', err.message);
                } else {
                    console.log('חיבור בסיס הנתונים נסגר');
                }
                resolve();
            });
        });
    }
}

// יצירת instance יחיד של בסיס הנתונים
const db = new Database();

// אם הקובץ מורץ ישירות, אתחל את בסיס הנתונים
if (require.main === module) {
    console.log('🔧 מאתחל בסיס נתונים...');
    db.init().then(() => {
        console.log('✅ בסיס הנתונים מוכן לשימוש!');
        process.exit(0);
    }).catch(err => {
        console.error('❌ שגיאה באתחול:', err);
        process.exit(1);
    });
}

module.exports = db;
