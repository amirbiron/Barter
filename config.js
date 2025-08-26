require('dotenv').config();

// ===============================================
// 🔧 Configuration Manager
// ===============================================

class Config {
    constructor() {
        this.validateRequiredEnvVars();
        this.loadConfig();
        this.validateConfig();
    }

    // בדיקת משתני סביבה חובה
    validateRequiredEnvVars() {
        const required = ['BOT_TOKEN'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ משתני סביבה חסרים:');
            missing.forEach(key => {
                console.error(`   - ${key}`);
            });
            console.error('\n💡 בדקו את קובץ .env שלכם');
            process.exit(1);
        }
    }

    // טעינת כל ההגדרות
    loadConfig() {
        // 🤖 הגדרות בוט בסיסיות
        this.bot = {
            token: process.env.BOT_TOKEN,
            language: process.env.BOT_LANGUAGE || 'he',
            useEmojis: process.env.USE_EMOJIS !== 'false',
            debugMode: process.env.DEBUG_MODE === 'true',
            polling: {
                timeout: parseInt(process.env.POLLING_TIMEOUT) || 10000,
                interval: 1000,
                autoStart: true
            }
        };

        // 🗃️ הגדרות בסיס נתונים
        this.database = {
            name: process.env.DB_NAME || 'barter_bot.db',
            // משתמש באותה לוגיקה כמו database.js
            path: (() => {
                const path = require('path');
                const fs = require('fs');
                
                // אם יש משתנה סביבה מפורש
                if (process.env.DATABASE_PATH) {
                    return process.env.DATABASE_PATH;
                }
                
                // אם אנחנו ב-Render
                if (process.env.RENDER) {
                    const persistentPath = '/opt/render/project/data';
                    if (fs.existsSync(persistentPath)) {
                        return path.join(persistentPath, 'barter_bot.db');
                    }
                }
                
                // ברירת מחדל
                return path.join(__dirname, 'barter_bot.db');
            })()
        };

        // 📊 הגדרות תוכן
        this.content = {
            maxTitleLength: parseInt(process.env.MAX_TITLE_LENGTH) || 100,
            maxDescriptionLength: parseInt(process.env.MAX_DESCRIPTION_LENGTH) || 1000,
            maxTags: parseInt(process.env.MAX_TAGS) || 10,
            maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS) || 10,
            maxBrowseResults: parseInt(process.env.MAX_BROWSE_RESULTS) || 15,
            maxPostsPerUser: parseInt(process.env.MAX_POSTS_PER_USER) || 20,
            deletedPostsRetentionDays: parseInt(process.env.DELETED_POSTS_RETENTION_DAYS) || 30
        };

        // 🔒 הגדרות אבטחה
        this.security = {
            adminUserIds: process.env.ADMIN_USER_IDS ? 
                process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [],
            postsRequireApproval: process.env.POSTS_REQUIRE_APPROVAL === 'true',
            userStateMaxAge: parseInt(process.env.USER_STATE_MAX_AGE) || 60, // דקות
            userStateCleanupInterval: parseInt(process.env.USER_STATE_CLEANUP_INTERVAL) || 3600 // שניות
        };

        // 🌐 הגדרות שרת
        this.server = {
            port: parseInt(process.env.PORT) || 3000,
            nodeEnv: process.env.NODE_ENV || 'development'
        };

        // 🎨 הגדרות ממשק
        this.ui = {
            colors: {
                barter: process.env.BARTER_COLOR || '#4CAF50',
                payment: process.env.PAYMENT_COLOR || '#FF9800', 
                both: process.env.BOTH_COLOR || '#9C27B0'
            }
        };

        // 📱 הגדרות פיצ'רים
        this.features = {
            enableSearch: true,
            enableBrowse: true,
            enableUserPosts: true,
            enablePostEditing: true,
            enablePostToggling: true,
            enableContactSharing: true,
            enableReporting: true,
            enableFavorites: true
        };

        // 📝 תבניות הודעות
        this.messages = this.getMessageTemplates();
    }

    // אימות הגדרות
    validateConfig() {
        // בדיקת אורכי טקסט
        if (this.content.maxTitleLength < 10 || this.content.maxTitleLength > 200) {
            console.warn('⚠️ אורך כותרת מקסימלי לא סביר, מגדיר ל-100');
            this.content.maxTitleLength = 100;
        }

        if (this.content.maxDescriptionLength < 50 || this.content.maxDescriptionLength > 2000) {
            console.warn('⚠️ אורך תיאור מקסימלי לא סביר, מגדיר ל-1000');
            this.content.maxDescriptionLength = 1000;
        }

        // בדיקת מספרי תוצאות
        if (this.content.maxSearchResults < 1 || this.content.maxSearchResults > 50) {
            this.content.maxSearchResults = 10;
        }

        if (this.content.maxBrowseResults < 1 || this.content.maxBrowseResults > 50) {
            this.content.maxBrowseResults = 15;
        }

        // בדיקת טוקן בוט
        if (!this.bot.token.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
            console.error('❌ טוקן בוט לא תקין. צורה נכונה: 123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
            console.error('💡 קבלו טוקן חדש מ-@BotFather');
        }

        console.log('✅ הגדרות נטענו בהצלחה');
        if (this.bot.debugMode) {
            console.log('🐛 מצב debug פעיל');
        }
    }

    // תבניות הודעות
    getMessageTemplates() {
        const emojis = this.bot.useEmojis;
        
        return {
            welcome: `
${emojis ? '🎯' : ''} *ברוכים הבאים לבוט הבארטר והשירותים!*

כאן תוכלו:
${emojis ? '📝' : '•'} לפרסם שירותים בבארטר או תשלום
${emojis ? '🔍' : '•'} לחפש שירותים לפי מילות מפתח
${emojis ? '📱' : '•'} לדפדף במודעות אחרונות
${emojis ? '📋' : '•'} לנהל את המודעות שלכם

בחרו אפשרות מהתפריט למטה ${emojis ? '👇' : ''}
            `,

            help: `
${emojis ? '📖' : ''} *מדריך שימוש:*

${emojis ? '🔹' : '•'} *פרסום שירות:* פרסמו את השירות שלכם - בארטר, תשלום או שניהם
${emojis ? '🔹' : '•'} *חיפוש:* חפשו שירותים לפי מילות מפתח
${emojis ? '🔹' : '•'} *דפדוף:* עיינו במודעות האחרונות עם אפשרות סינון
${emojis ? '🔹' : '•'} *המודעות שלי:* נהלו את המודעות שלכם - עריכה, מחיקה, הפעלה/הקפאה

${emojis ? '💡' : ''} *טיפים:*
• השתמשו במילים ברורות בכותרת
• הוסיפו תגיות רלוונטיות לחיפוש טוב יותר
• כתבו תיאור מפורט של השירות

${emojis ? '❓' : ''} *שאלות?* פנו למפתח
            `,

            noResults: `${emojis ? '🔍' : ''} לא נמצאו תוצאות לחיפוש שלכם.\n\nנסו מילות מפתח אחרות.`,

            postCreated: `${emojis ? '✅' : ''} *המודעה נוצרה בהצלחה!*\n\nהיא מופיעה כעת בחיפוש ובדפדוף.`,

            error: `${emojis ? '❌' : ''} אירעה שגיאה. נסו שוב מאוחר יותר.`,

            unknownCommand: `${emojis ? '❓' : ''} לא הבנתי. בחרו אפשרות מהתפריט:`,

            noUserPosts: `${emojis ? '📋' : ''} אין לכם מודעות פעילות.\n\nלחצו על "${emojis ? '📝' : ''}פרסום שירות" ליצירת מודעה ראשונה!`,

            featureInDevelopment: `${emojis ? '🚧' : ''} התכונה עוד בפיתוח`
        };
    }

    // פונקציות עזר
    isAdmin(userId) {
        return this.security.adminUserIds.includes(userId);
    }

    isProd() {
        return this.server.nodeEnv === 'production';
    }

    isDev() {
        return this.server.nodeEnv === 'development';
    }

    log(message, level = 'info') {
        if (this.bot.debugMode || level === 'error') {
            const timestamp = new Date().toISOString();
            const levelEmoji = {
                info: 'ℹ️',
                warn: '⚠️', 
                error: '❌',
                debug: '🐛'
            };
            
            console.log(`[${timestamp}] ${levelEmoji[level] || 'ℹ️'} ${message}`);
        }
    }

    // וולידציה של נתוני משתמש
    validatePostData(postData) {
        const errors = [];

        // בדיקת כותרת
        if (!postData.title || postData.title.trim().length === 0) {
            errors.push('כותרת חובה');
        } else if (postData.title.length > this.content.maxTitleLength) {
            errors.push(`כותרת ארוכה מדי (מקסימום ${this.content.maxTitleLength} תווים)`);
        }

        // בדיקת תיאור
        if (!postData.description || postData.description.trim().length === 0) {
            errors.push('תיאור חובה');
        } else if (postData.description.length > this.content.maxDescriptionLength) {
            errors.push(`תיאור ארוך מדי (מקסימום ${this.content.maxDescriptionLength} תווים)`);
        }

        // בדיקת מצב תמחור
        if (!['barter', 'payment', 'both'].includes(postData.pricingMode)) {
            errors.push('מצב תמחור לא תקין');
        }

        // בדיקת פרטי קשר
        if (!postData.contactInfo || postData.contactInfo.trim().length === 0) {
            errors.push('פרטי קשר חובה');
        }

        // בדיקת תגיות
        if (postData.tags && postData.tags.length > this.content.maxTags) {
            errors.push(`יותר מדי תגיות (מקסימום ${this.content.maxTags})`);
        }

        return errors;
    }

    // קבלת הגדרות עיצוב לפי מצב תמחור
    getPricingStyle(pricingMode) {
        const styles = {
            barter: {
                emoji: '🔄',
                name: 'בארטר',
                color: this.ui.colors.barter
            },
            payment: {
                emoji: '💰',
                name: 'תשלום',
                color: this.ui.colors.payment
            },
            both: {
                emoji: '🔄💰',
                name: 'בארטר או תשלום',
                color: this.ui.colors.both
            }
        };

        return styles[pricingMode] || styles.both;
    }
}

// יצירת instance יחיד
const config = new Config();

// יצוא הקובץ
module.exports = config;
