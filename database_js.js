const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// נתיב לבסיס הנתונים - יישמר בתיקיית הפרויקט
const DB_PATH = path.join(__dirname, 'barter_bot.db');

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ שגיאה בפתיחת בסיס הנתונים:', err.message);
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
                        pricing_mode TEXT CHECK(pricing_mode IN ('barter', 'payment', 'both')) NOT NULL,
                        price_range TEXT,
                        portfolio_links TEXT,
                        contact_info TEXT NOT NULL,
                        tags TEXT, -- JSON string של מערך תגיות
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1,
                        FOREIGN KEY (user_id) REFERENCES users (user_id)
                    )
                `);

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
            const { userId, title, description, pricingMode, priceRange, portfolioLinks, contactInfo, tags } = postData;
            const tagsJson = JSON.stringify(tags || []);
            
            const sql = `
                INSERT INTO posts (user_id, title, description, pricing_mode, price_range, portfolio_links, contact_info, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [userId, title, description, pricingMode, priceRange, portfolioLinks, contactInfo, tagsJson], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    // חיפוש מודעות (FTS5)
    searchPosts(query, filters = {}) {
        return new Promise((resolve, reject) => {
            let sql, params;
            
            if (query && query.trim()) {
                // חיפוש טקסט חופשי עם FTS5
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts_fts f
                    JOIN posts p ON f.rowid = p.id
                    JOIN users u ON p.user_id = u.user_id
                    WHERE posts_fts MATCH ? AND p.is_active = 1
                `;
                params = [query];
                
                // הוספת סינונים
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
                
            } else {
                // אם אין חיפוש טקסט, הצג את כל המודעות
                sql = `
                    SELECT p.*, u.username, u.first_name
                    FROM posts p
                    JOIN users u ON p.user_id = u.user_id
                    WHERE p.is_active = 1
                `;
                params = [];
                
                if (filters.pricingMode) {
                    sql += ` AND p.pricing_mode IN ('${filters.pricingMode}', 'both')`;
                }
            }
            
            sql += ` ORDER BY p.created_at DESC LIMIT 20`;
            
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else {
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
                WHERE user_id = ? AND is_active = 1 
                ORDER BY created_at DESC
            `;
            this.db.all(sql, [userId], (err, rows) => {
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

    // מחיקת מודעה (soft delete)
    deletePost(postId, userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE posts 
                SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `;
            this.db.run(sql, [postId, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
        });
    }

    // הפעלה/הקפאה של מודעה
    togglePost(postId, userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE posts 
                SET is_active = 1 - is_active, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `;
            this.db.run(sql, [postId, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
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
                WHERE p.id = ? AND p.is_active = 1
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