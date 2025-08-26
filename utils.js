const config = require('./config');

// ===============================================
// 🛠️ Utility Functions & Validation
// ===============================================

class Utils {
    constructor() {
        this.emojis = config.bot.useEmojis;
    }

    // 📅 פונקציות זמן ותאריך
    formatDate(date, locale = 'he-IL') {
        if (!date) {return 'לא ידוע';}
        
        try {
            const d = new Date(date);
            return d.toLocaleDateString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: config.server.timezone
            });
        } catch (error) {
            return 'תאריך לא תקין';
        }
    }

    formatDateTime(date, locale = 'he-IL') {
        if (!date) {return 'לא ידוע';}
        
        try {
            const d = new Date(date);
            return d.toLocaleString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: config.server.timezone,
                hour12: false
            });
        } catch (error) {
            return 'זמן לא תקין';
        }
    }

    getTimeAgo(date, locale = 'he') {
        if (!date) {return 'זמן לא ידוע';}
        
        const now = new Date();
        const past = new Date(date);
        const diffMs = now - past;
        
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);

        if (diffMinutes < 60) {return `${diffMinutes} דקות`;}
        if (diffHours < 48) {return `${diffHours} שעות`;}
        if (diffDays < 14) {return `${diffDays} ימים`;}
        if (diffWeeks < 8) {return `${diffWeeks} שבועות`;}
        return `${diffMonths} חודשים`;
    }

    // 🔍 פונקציות טקסט וחיפוש
    sanitizeText(text) {
        if (!text || typeof text !== 'string') {return '';}

        return text
            .trim()
            .replace(/\s+/g, ' ') // מחליף כמה רווחים ברווח יחיד
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // מסיר תווים בלתי נראים
            .substring(0, 2000); // מגביל אורך
    }

    cleanHtml(text) {
        if (!text) {return '';}
        return text.replace(/<[^>]*>/g, '');
    }

    escapeMarkdown(text) {
        if (!text) {return '';}
        // Escape MarkdownV2 special characters
        // See: https://core.telegram.org/bots/api#markdownv2-style
        // eslint-disable-next-line no-useless-escape
        return text.replace(/([_\*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    highlightSearchTerms(text, searchTerms) {
        if (!text || !searchTerms) {return text;}

        const terms = Array.isArray(searchTerms) ? searchTerms : [searchTerms];
        let result = text;

        terms.forEach((term) => {
            if (term.length > 2) {
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                result = result.replace(regex, '**$1**');
            }
        });

        return result;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 📱 פונקציות פרטי קשר
    validateContact(contactInfo) {
        if (!contactInfo || contactInfo.length < 3) {
            return { isValid: false, error: 'פרטי קשר חובה' };
        }

        const contact = contactInfo.trim();

        // בדיקת אימייל
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(contact)) {
            return { isValid: true, type: 'email', formatted: contact.toLowerCase() };
        }

        // בדיקת טלפון ישראלי
        const phoneRegex = /^(\+972|0)(5[0-9]|2|3|4|7|8|9)-?[0-9]{7,8}$/;
        const cleanPhone = contact.replace(/[\s-]/g, '');
        if (phoneRegex.test(cleanPhone)) {
            return { isValid: true, type: 'phone', formatted: this.formatPhone(cleanPhone) };
        }

        // בדיקת טלגרם
        const telegramRegex = /^@?[a-zA-Z0-9_]{5,32}$/;
        if (telegramRegex.test(contact) || contact.includes('t.me/')) {
            const username = contact.replace(/^@/, '').replace('t.me/', '');
            return { isValid: true, type: 'telegram', formatted: `@${username}` };
        }

        // אם זה לא מתאים לפורמטים הידועים, אבל יש בו מידע
        if (contact.length >= 5) {
            return { isValid: true, type: 'other', formatted: contact };
        }

        return { isValid: false, error: 'פורמט פרטי קשר לא תקין' };
    }

    formatPhone(phone) {
        if (!phone) {return '';}

        const cleaned = phone.replace(/\D/g, '');

        // טלפון ישראלי
        if (cleaned.startsWith('972')) {
            return `+972-${cleaned.substring(3, 5)}-${cleaned.substring(5)}`;
        } else if (cleaned.startsWith('05')) {
            return `${cleaned.substring(0, 3)}-${cleaned.substring(3)}`;
        }

        return phone;
    }

    detectContactType(contact) {
        const validation = this.validateContact(contact);
        return validation.isValid ? validation.type : 'unknown';
    }

    // 🏷️ פונקציות תגיות
    validateTags(tagsInput) {
        if (!tagsInput) {return [];}

        let tags = [];

        if (Array.isArray(tagsInput)) {
            tags = tagsInput;
        } else if (typeof tagsInput === 'string') {
            tags = tagsInput.split(/[,،]/); // תמיכה בפסיקים בעברית וערבית
        }

        return tags
            .map((tag) => this.sanitizeText(tag))
            .filter((tag) => tag.length > 0)
            .filter((tag) => tag.length <= 50) // מגבלת אורך תגית
            .slice(0, config.content.maxTags) // מגבלת כמות תגיות
            .map((tag) => tag.toLowerCase());
    }

    formatTags(tags) {
        if (!tags || tags.length === 0) {return 'אין תגיות';}
        return tags.map((tag) => `#${tag}`).join(', ');
    }

    getPopularTags(posts, limit = 10) {
        const tagCount = {};

        posts.forEach((post) => {
            if (post.tags) {
                post.tags.forEach((tag) => {
                    tagCount[tag] = (tagCount[tag] || 0) + 1;
                });
            }
        });

        return Object.entries(tagCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([tag, count]) => ({ tag, count }));
    }

    // 💰 פונקציות תמחור
    validatePriceRange(priceInput) {
        if (!priceInput || priceInput.toLowerCase() === 'דלג') {
            return { isValid: true, formatted: null };
        }

        const price = this.sanitizeText(priceInput);

        // פורמטים מקובלים: "100-500", "100 עד 500", "500 ש״ח", וכו'
        const priceRegex = /(\d+)(?:\s*[-עד\s]\s*(\d+))?\s*(ש״ח|שקל|שקלים|₪|\$|dollar|dollars)?/i;
        const match = price.match(priceRegex);

        if (match) {
            const min = parseInt(match[1]);
            const max = match[2] ? parseInt(match[2]) : null;
            const currency = match[3] ? this.normalizeCurrency(match[3]) : 'ש״ח';

            if (max && min > max) {
                return { isValid: false, error: 'המחיר המינימלי גבוה מהמקסימלי' };
            }

            const formatted = max ? `${min}-${max} ${currency}` : `${min}+ ${currency}`;

            return { isValid: true, formatted, min, max, currency };
        }

        return { isValid: false, error: 'פורמט מחיר לא תקין. דוגמא: "100-500 ש״ח"' };
    }

    normalizeCurrency(currency) {
        const currencyMap = {
            שקל: 'ש״ח',
            שקלים: 'ש״ח',
            '₪': 'ש״ח',
            dollar: '$',
            dollars: '$',
        };

        return currencyMap[currency.toLowerCase()] || currency;
    }

    // 🔗 פונקציות קישורים
    validateLinks(linksInput) {
        if (!linksInput || linksInput.toLowerCase() === 'דלג') {
            return { isValid: true, links: [] };
        }

        const linkText = this.sanitizeText(linksInput);
        const urlRegex =
            /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/g;
        const foundLinks = linkText.match(urlRegex) || [];

        const validLinks = foundLinks
            .map((link) => this.normalizeUrl(link))
            .filter((link) => this.isValidUrl(link))
            .slice(0, 5); // מגביל ל-5 קישורים

        return { isValid: true, links: validLinks };
    }

    normalizeUrl(url) {
        if (!url.startsWith('http')) {
            return 'https://' + url;
        }
        return url;
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    formatLinks(links) {
        if (!links || links.length === 0) {return 'אין קישורים';}
        return links.map((link, index) => `${index + 1}. ${link}`).join('\n');
    }

    // 📊 פונקציות סטטיסטיקה ודוחות
    generatePostStats(post, interactions = {}) {
        const stats = {
            views: interactions.views || 0,
            contacts: interactions.contacts || 0,
            saves: interactions.saves || 0,
            shares: interactions.shares || 0,
            reports: interactions.reports || 0,
        };

        const age = this.getTimeAgo(post.created_at);
        const engagement =
            stats.views > 0
                ? Math.round(((stats.contacts + stats.saves + stats.shares) / stats.views) * 100)
                : 0;

        return {
            ...stats,
            age,
            engagement: `${engagement}%`,
            summary: this.generateStatsSummary(stats, age),
        };
    }

    generateStatsSummary(stats, age) {
        const e = this.emojis;

        let summary = `📊 *סטטיסטיקה (${age}):*\n\n`;
        summary += `${e ? '👁️' : '•'} צפיות: ${stats.views}\n`;
        summary += `${e ? '📞' : '•'} פניות: ${stats.contacts}\n`;
        summary += `${e ? '⭐' : '•'} שמירות: ${stats.saves}\n`;
        summary += `${e ? '📤' : '•'} שיתופים: ${stats.shares}\n`;

        if (stats.reports > 0) {
            summary += `${e ? '🚨' : '•'} דיווחים: ${stats.reports}\n`;
        }

        return summary;
    }

    // 🔒 פונקציות אבטחה
    sanitizeUserId(userId) {
        const id = parseInt(userId);
        return isNaN(id) ? null : id;
    }

    isValidPostId(postId) {
        const id = parseInt(postId);
        return !isNaN(id) && id > 0;
    }

    checkRateLimit(userId, action, limits = {}) {
        // מערכת rate limiting פשוטה
        const defaultLimits = {
            posts: { count: 5, period: 3600000 }, // 5 מודעות לשעה
            searches: { count: 50, period: 3600000 }, // 50 חיפושים לשעה
            contacts: { count: 20, period: 3600000 }, // 20 פניות לשעה
        };

        const limit = limits[action] || defaultLimits[action];
        if (!limit) {return { allowed: true };}

        // כאן יש לממש לוגיקת rate limiting בפועל
        // לעת עתה נחזיר תמיד מותר
        return { allowed: true, remaining: limit.count };
    }

    // 🎨 פונקציות עיצוב ותצוגה
    truncateText(text, maxLength = 100, suffix = '...') {
        if (!text || text.length <= maxLength) {return text;}
        return text.substring(0, maxLength - suffix.length) + suffix;
    }

    formatPostPreview(post) {
        const style = config.getPricingStyle(post.pricing_mode);
        const e = this.emojis;

        // הוספת אינדיקציה אם המודעה מוקפאת
        let statusIcon = '';
        if (!post.is_active) {
            statusIcon = `${e ? '⏸️ ' : '[מוקפאת] '}`;
        }

        let preview = `${statusIcon}${e ? style.emoji + ' ' : ''}*${this.truncateText(post.title, 50)}*\n`;
        preview += `${this.truncateText(post.description, 100)}\n\n`;
        preview += `${e ? '💡' : '•'} ${style.name}`;

        if (post.price_range) {
            preview += ` • ${post.price_range}`;
        }

        if (post.tags && post.tags.length > 0) {
            const displayTags = post.tags.slice(0, 3);
            preview += `\n${e ? '🏷️' : '#'} ${displayTags.join(', ')}`;
            if (post.tags.length > 3) {
                preview += ` +${post.tags.length - 3}`;
            }
        }

        preview += `\n${e ? '📅' : '•'} ${this.getTimeAgo(post.created_at)}`;

        return preview;
    }

    formatFullPost(post, showContact = false) {
        const style = config.getPricingStyle(post.pricing_mode);
        const e = this.emojis;

        // הוספת סימון למודעה פרטית
        const visibilityIcon = post.visibility === 'private' ? '🔒 ' : '';
        const visibilityNote =
            post.visibility === 'private'
                ? '\n\n🔒 *מודעת בדיקה (פרטית)* - לא מופיעה בחיפושים'
                : '';

        let message = `${visibilityIcon}${e ? style.emoji + ' ' : ''}*${post.title}*\n\n`;
        message += `📄 ${post.description}\n\n`;
        message += `${e ? '💡' : '•'} *מצב תמחור:* ${style.name}\n`;

        if (post.price_range) {
            message += `${e ? '💵' : '•'} *טווח מחיר:* ${post.price_range}\n`;
        }

        if (post.tags && post.tags.length > 0) {
            message += `${e ? '🏷️' : '•'} *תגיות:* ${this.formatTags(post.tags)}\n`;
        }

        if (post.portfolio_links) {
            const linkValidation = this.validateLinks(post.portfolio_links);
            if (linkValidation.links.length > 0) {
                message += `${e ? '🔗' : '•'} *קישורים:*\n${this.formatLinks(linkValidation.links)}\n`;
            }
        }

        if (showContact) {
            message += `\n${e ? '📞' : '•'} *פרטי קשר:* ${post.contact_info}`;
        }

        message += `\n\n${e ? '👤' : '•'} *מפרסם:* ${post.first_name || post.username || 'אנונימי'}`;
        message += `\n${e ? '📅' : '•'} *פורסם:* ${this.formatDateTime(post.created_at)}`;

        message += visibilityNote; // הוספת הערת פרטיות בסוף

        return message;
    }

    // 🔧 פונקציות עזר כלליות
    generateId(prefix = '', length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = prefix;
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {return obj;}
        if (obj instanceof Date) {return new Date(obj.getTime());}
        if (obj instanceof Array) {return obj.map((item) => this.deepClone(item));}
        if (typeof obj === 'object') {
            const cloned = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
        return obj;
    }

    // 🐛 פונקציות דיבוג ולוגינג
    logAction(userId, action, details = {}) {
        if (config.bot.debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] 👤 User ${userId} -> ${action}`, details);
        }
    }

    logError(error, context = '') {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ❌ Error${context ? ' in ' + context : ''}:`, error);

        if (config.bot.debugMode && error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }

    // 📝 תיעוד ובדיקות
    validateEnvironment() {
        const issues = [];

        if (!config.bot.token) {
            issues.push('BOT_TOKEN חסר');
        }

        try {
            const fs = require('fs');
            const dbPath = config.database.path;
            const dir = require('path').dirname(dbPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (error) {
            issues.push('בעיה בגישה לתיקיית בסיס הנתונים');
        }

        return {
            isValid: issues.length === 0,
            issues,
        };
    }

    getSystemInfo() {
        return {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            config: {
                dbPath: config.database.path,
                debugMode: config.bot.debugMode,
                maxPosts: config.content.maxPostsPerUser,
            },
        };
    }
}

// יצירת instance יחיד
const utils = new Utils();

module.exports = utils;
