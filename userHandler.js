const config = require('./config');
const db = require('./database');
const keyboards = require('./keyboard');
const utils = require('./utils');

// ===============================================
// 👥 Advanced User Management & Post Operations
// ===============================================

class UserHandler {
    constructor(bot) {
        this.bot = bot;
        this.emojis = config.bot.useEmojis;
        this.editingSessions = new Map(); // מעקב אחרי סשני עריכה
        this.userInteractions = new Map(); // מעקב אחרי אינטראקציות משתמשים
    }

    // 📋 ניהול מודעות מתקדם
    async showUserPostsDetailed(chatId, userId) {
        try {
            const posts = await db.getUserPosts(userId);
            
            if (posts.length === 0) {
                await this.bot.sendMessage(chatId, config.messages.noUserPosts, keyboards.getMainKeyboard());
                return;
            }

            const e = this.emojis;
            const activePosts = posts.filter(p => p.is_active);
            const inactivePosts = posts.filter(p => !p.is_active);
            
            let summary = `📊 *סיכום המודעות שלכם:*\n\n`;
            summary += `${e ? '✅' : '•'} מודעות פעילות: ${activePosts.length}\n`;
            summary += `${e ? '⏸️' : '•'} מודעות מוקפאות: ${inactivePosts.length}\n`;
            summary += `${e ? '📈' : '•'} סה״כ: ${posts.length}/${config.content.maxPostsPerUser}\n\n`;
            summary += `בחרו מודעה לניהול:`;

            await this.bot.sendMessage(chatId, summary, { 
                parse_mode: 'Markdown',
                ...keyboards.getMainKeyboard()
            });

            // הצגת כל מודעה עם כפתורי ניהול
            for (const post of posts.slice(0, 10)) { // מגביל ל-10 מודעות
                const message = utils.formatPostPreview(post);
                const keyboard = keyboards.getUserPostActionsKeyboard(post.id, post.is_active);
                
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
                
                // השהייה קטנה למניעת spam
                await utils.sleep(100);
            }

            if (posts.length > 10) {
                await this.bot.sendMessage(chatId, 
                    `${e ? '📄' : '•'} מוצגות 10 מודעות ראשונות. השתמשו בחיפוש כדי למצוא מודעה ספציפית.`
                );
            }

        } catch (error) {
            utils.logError(error, 'showUserPostsDetailed');
            await this.bot.sendMessage(chatId, config.messages.error);
        }
    }

    // ✏️ עריכת מודעות
    async startEditingPost(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            const post = await db.getPost(postId);
            
            if (!post || post.user_id !== userId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 
                    `${this.emojis ? '❌' : ''} המודעה לא נמצאה או שאין לכם הרשאה לערוך אותה`
                );
                return;
            }

            // הצגת המודעה הנוכחית
            const currentPost = utils.formatFullPost(post, true);
            await this.bot.editMessageText(
                `*המודעה הנוכחית:*\n\n${currentPost}\n\n*מה תרצו לערוך?*`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    ...keyboards.getEditConfirmKeyboard(postId)
                }
            );

            await this.bot.answerCallbackQuery(callbackQuery.id);

        } catch (error) {
            utils.logError(error, 'startEditingPost');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    async handleEditField(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const [action, field, postId] = callbackQuery.data.split('_');

        try {
            const post = await db.getPost(parseInt(postId));
            
            if (!post || post.user_id !== userId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'אין הרשאה');
                return;
            }

            // יצירת סשן עריכה
            const sessionId = `${userId}_${postId}_${field}`;
            this.editingSessions.set(sessionId, {
                userId,
                postId: parseInt(postId),
                field,
                originalPost: post,
                messageId: callbackQuery.message.message_id,
                startTime: Date.now()
            });

            // בקשת קלט מהמשתמש לפי שדה
            const fieldInstructions = this.getEditInstructions(field, post);
            
            await this.bot.editMessageText(fieldInstructions, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            });

            await this.bot.answerCallbackQuery(callbackQuery.id);

            // ניקוי סשן עריכה אחרי timeout
            setTimeout(() => {
                if (this.editingSessions.has(sessionId)) {
                    this.editingSessions.delete(sessionId);
                }
            }, config.security.userStateMaxAge * 60 * 1000);

        } catch (error) {
            utils.logError(error, 'handleEditField');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    getEditInstructions(field, post) {
        const e = this.emojis;
        
        const instructions = {
            title: `${e ? '📝' : ''} *עריכת כותרת*\n\nכותרת נוכחית: "${post.title}"\n\nהקלידו כותרת חדשה:`,
            desc: `${e ? '📄' : ''} *עריכת תיאור*\n\nתיאור נוכחי: "${utils.truncateText(post.description, 200)}"\n\nהקלידו תיאור חדש:`,
            pricing: `${e ? '💰' : ''} *עריכת מצב תמחור*\n\nמצב נוכחי: ${config.getPricingStyle(post.pricing_mode).name}\n\nבחרו מצב חדש:`,
            tags: `${e ? '🏷️' : ''} *עריכת תגיות*\n\nתגיות נוכחיות: ${utils.formatTags(post.tags)}\n\nהקלידו תגיות חדשות (מופרדות בפסיק):`,
            links: `${e ? '🔗' : ''} *עריכת קישורים*\n\nקישורים נוכחיים: ${post.portfolio_links || 'אין'}\n\nהקלידו קישורים חדשים:`,
            contact: `${e ? '📞' : ''} *עריכת פרטי קשר*\n\nפרטי קשר נוכחיים: "${post.contact_info}"\n\nהקלידו פרטי קשר חדשים:`
        };

        return instructions[field] || 'עריכה לא מוכרת';
    }

    async processEditInput(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // חיפוש סשן עריכה פעיל
        let activeSession = null;
        for (const [sessionId, session] of this.editingSessions) {
            if (session.userId === userId) {
                activeSession = { sessionId, ...session };
                break;
            }
        }

        if (!activeSession) {
            return false; // לא נמצא סשן עריכה פעיל
        }

        try {
            const validation = this.validateEditInput(activeSession.field, text);
            
            if (!validation.isValid) {
                await this.bot.sendMessage(chatId, 
                    `${this.emojis ? '❌' : ''} ${validation.error}\n\nנסו שוב:`,
                    keyboards.removeInlineKeyboard()
                );
                return true;
            }

            // עדכון השדה במסד הנתונים
            await this.updatePostField(activeSession.postId, activeSession.field, validation.value);

            // הודעת הצלחה
            const e = this.emojis;
            await this.bot.sendMessage(chatId, 
                `${e ? '✅' : ''} השדה עודכן בהצלחה!\n\n*הערך החדש:* ${validation.formatted || validation.value}`,
                {
                    parse_mode: 'Markdown',
                    ...keyboards.getMainKeyboard()
                }
            );

            // ניקוי הסשן
            this.editingSessions.delete(activeSession.sessionId);
            
            utils.logAction(userId, 'edit_post_field', { 
                postId: activeSession.postId, 
                field: activeSession.field,
                newValue: validation.value
            });

            return true;

        } catch (error) {
            utils.logError(error, 'processEditInput');
            await this.bot.sendMessage(chatId, config.messages.error);
            this.editingSessions.delete(activeSession.sessionId);
            return true;
        }
    }

    validateEditInput(field, input) {
        switch (field) {
            case 'title':
                if (!input || input.trim().length < 3) {
                    return { isValid: false, error: 'כותרת חייבת להכיל לפחות 3 תווים' };
                }
                if (input.length > config.content.maxTitleLength) {
                    return { isValid: false, error: `כותרת ארוכה מדי (מקסימום ${config.content.maxTitleLength} תווים)` };
                }
                return { isValid: true, value: utils.sanitizeText(input) };

            case 'desc':
                if (!input || input.trim().length < 10) {
                    return { isValid: false, error: 'תיאור חייב להכיל לפחות 10 תווים' };
                }
                if (input.length > config.content.maxDescriptionLength) {
                    return { isValid: false, error: `תיאור ארוך מדי (מקסימום ${config.content.maxDescriptionLength} תווים)` };
                }
                return { isValid: true, value: utils.sanitizeText(input) };

            case 'tags':
                const tags = utils.validateTags(input);
                return { 
                    isValid: true, 
                    value: tags,
                    formatted: utils.formatTags(tags)
                };

            case 'links':
                const linkValidation = utils.validateLinks(input);
                return { 
                    isValid: true, 
                    value: linkValidation.links.join('\n'),
                    formatted: utils.formatLinks(linkValidation.links)
                };

            case 'contact':
                const contactValidation = utils.validateContact(input);
                if (!contactValidation.isValid) {
                    return { isValid: false, error: contactValidation.error };
                }
                return { isValid: true, value: contactValidation.formatted };

            default:
                return { isValid: false, error: 'שדה לא מוכר' };
        }
    }

    async updatePostField(postId, field, value) {
        return new Promise((resolve, reject) => {
            const fieldMap = {
                title: 'title',
                desc: 'description',
                tags: 'tags',
                links: 'portfolio_links',
                contact: 'contact_info'
            };

            const dbField = fieldMap[field];
            if (!dbField) {
                reject(new Error('שדה לא תקין'));
                return;
            }

            const processedValue = field === 'tags' ? JSON.stringify(value) : value;
            
            const sql = `
                UPDATE posts 
                SET ${dbField} = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            db.db.run(sql, [processedValue, postId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
        });
    }

    // 🔄 הפעלה/הקפאת מודעות
    async togglePostStatus(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            const post = await db.getPost(postId);
            
            if (!post || post.user_id !== userId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'אין הרשאה');
                return;
            }

            const success = await db.togglePost(postId, userId);
            
            if (success) {
                const newStatus = post.is_active ? 'הוקפאה' : 'הופעלה';
                const e = this.emojis;
                
                await this.bot.answerCallbackQuery(callbackQuery.id, 
                    `${e ? '✅' : ''} המודעה ${newStatus} בהצלחה`
                );

                // עדכון הכפתורים
                const newKeyboard = keyboards.getUserPostActionsKeyboard(postId, !post.is_active);
                await this.bot.editMessageReplyMarkup(newKeyboard.reply_markup, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id
                });

                utils.logAction(userId, 'toggle_post', { postId, newStatus: !post.is_active });
            } else {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'שגיאה בעדכון המודעה');
            }

        } catch (error) {
            utils.logError(error, 'togglePostStatus');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    // 🗑️ מחיקת מודעות
    async confirmDeletePost(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        const e = this.emojis;
        const confirmMessage = `${e ? '⚠️' : ''} *אישור מחיקה*\n\nהאם אתם בטוחים שברצונכם למחוק את המודעה?\n\n${e ? '🔥' : '•'} הפעולה בלתי הפיכה!\n${e ? '📊' : '•'} כל הנתונים והסטטיסטיקות יאבדו.`;

        await this.bot.editMessageText(confirmMessage, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            ...keyboards.getDeleteConfirmKeyboard(postId)
        });

        await this.bot.answerCallbackQuery(callbackQuery.id);
    }

    async executeDeletePost(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[2]);

        try {
            const post = await db.getPost(postId);
            
            if (!post || post.user_id !== userId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'אין הרשאה');
                return;
            }

            const success = await db.deletePost(postId, userId);
            
            if (success) {
                const e = this.emojis;
                await this.bot.editMessageText(
                    `${e ? '✅' : ''} *המודעה נמחקה בהצלחה*\n\nהמודעה "${utils.truncateText(post.title, 50)}" הוסרה מהמערכת.`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        ...keyboards.getMainKeyboard()
                    }
                );

                utils.logAction(userId, 'delete_post', { postId, title: post.title });
            } else {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'שגיאה במחיקת המודעה');
            }

        } catch (error) {
            utils.logError(error, 'executeDeletePost');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    // 📞 טיפול בפרטי קשר
    async handleContactRequest(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            const post = await db.getPost(postId);
            
            if (!post) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'המודעה לא נמצאה');
                return;
            }

            // רישום אינטראקציה
            this.trackInteraction(userId, postId, 'contact');

            // הצגת פרטי קשר עם אפשרויות פעולה
            const contactMessage = utils.formatFullPost(post, true);
            const keyboard = keyboards.getContactActionsKeyboard(postId, post.contact_info);

            await this.bot.editMessageText(contactMessage, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                ...keyboard
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, 
                `${this.emojis ? '📞' : ''} פרטי קשר נחשפו`
            );

            utils.logAction(userId, 'view_contact', { postId, postOwner: post.user_id });

        } catch (error) {
            utils.logError(error, 'handleContactRequest');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    // ⭐ שמירת מודעות למועדפים
    async handleSavePost(callbackQuery) {
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            // כאן יש לממש שמירה במסד נתונים
            // לעת עתה נעשה רק tracking
            this.trackInteraction(userId, postId, 'save');

            await this.bot.answerCallbackQuery(callbackQuery.id, 
                `${this.emojis ? '⭐' : ''} המודעה נשמרה למועדפים!`
            );

            utils.logAction(userId, 'save_post', { postId });

        } catch (error) {
            utils.logError(error, 'handleSavePost');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.featureInDevelopment);
        }
    }

    // 🚨 דיווחים
    async handleReportPost(callbackQuery) {
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            // רישום דיווח
            this.trackInteraction(userId, postId, 'report');

            const e = this.emojis;
            const reportMessage = `${e ? '🚨' : ''} *דיווח על מודעה*\n\nהדיווח שלכם נקלט במערכת.\n\nמודעות המקבלות דיווחים מרובים נבדקות ועלולות להיות הוסרות.\n\nתודה על שמירה על איכות הקהילה!`;

            await this.bot.answerCallbackQuery(callbackQuery.id, 'הדיווח נשלח');
            
            await this.bot.sendMessage(callbackQuery.message.chat.id, reportMessage, {
                parse_mode: 'Markdown',
                ...keyboards.getMainKeyboard()
            });

            utils.logAction(userId, 'report_post', { postId });

            // התראה למנהלים (אם יש)
            if (config.security.adminUserIds.length > 0) {
                const post = await db.getPost(postId);
                const adminMessage = `🚨 *דיווח חדש*\n\nמודעה: "${post?.title || 'לא ידוע'}"\nמדווח: ${userId}\nID מודעה: ${postId}`;
                
                for (const adminId of config.security.adminUserIds) {
                    try {
                        await this.bot.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' });
                    } catch (adminError) {
                        // מתעלם משגיאות שליחה למנהלים
                    }
                }
            }

        } catch (error) {
            utils.logError(error, 'handleReportPost');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    // 📊 סטטיסטיקות מודעה
    async showPostStats(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const postId = parseInt(callbackQuery.data.split('_')[1]);

        try {
            const post = await db.getPost(postId);
            
            if (!post || post.user_id !== userId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, 'אין הרשאה');
                return;
            }

            // קבלת סטטיסטיקות
            const interactions = this.getPostInteractions(postId);
            const stats = utils.generatePostStats(post, interactions);
            
            const statsMessage = `📊 *סטטיסטיקות מודעה*\n\n*כותרת:* ${post.title}\n\n${stats.summary}`;

            await this.bot.editMessageText(statsMessage, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown',
                ...keyboards.getStatsKeyboard(postId)
            });

            await this.bot.answerCallbackQuery(callbackQuery.id);

        } catch (error) {
            utils.logError(error, 'showPostStats');
            await this.bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
        }
    }

    // 🔄 מעקב אחרי אינטראקציות
    trackInteraction(userId, postId, type) {
        const key = `${postId}`;
        
        if (!this.userInteractions.has(key)) {
            this.userInteractions.set(key, {
                views: 0,
                contacts: 0,
                saves: 0,
                shares: 0,
                reports: 0,
                uniqueUsers: new Set()
            });
        }

        const interactions = this.userInteractions.get(key);
        interactions[type] = (interactions[type] || 0) + 1;
        interactions.uniqueUsers.add(userId);

        // שמירה בזכרון לפרק זמן מוגבל
        setTimeout(() => {
            // כאן אפשר לשמור במסד הנתונים
        }, 1000);
    }

    getPostInteractions(postId) {
        const key = `${postId}`;
        return this.userInteractions.get(key) || {
            views: 0,
            contacts: 0, 
            saves: 0,
            shares: 0,
            reports: 0
        };
    }

    // 🔧 ניקוי מערכות פנימיות
    cleanup() {
        const now = Date.now();
        const maxAge = config.security.userStateMaxAge * 60 * 1000;

        // ניקוי סשני עריכה ישנים
        for (const [sessionId, session] of this.editingSessions) {
            if (now - session.startTime > maxAge) {
                this.editingSessions.delete(sessionId);
            }
        }

        // ניקוי אינטראקציות ישנות (שמור רק 24 שעות)
        // כאן יש לממש לוגיקה לניקוי אינטראקציות
        
        utils.logAction('system', 'cleanup', { 
            editingSessions: this.editingSessions.size,
            interactions: this.userInteractions.size 
        });
    }

    // 🚀 אתחול והפעלה
    init() {
        // ניקוי תקופתי
        setInterval(() => {
            this.cleanup();
        }, config.security.userStateCleanupInterval * 1000);

        utils.logAction('system', 'userHandler_initialized');
    }

    // 📋 פונקציות עזר
    isEditingSession(userId) {
        for (const session of this.editingSessions.values()) {
            if (session.userId === userId) {
                return true;
            }
        }
        return false;
    }

    getActiveEditSession(userId) {
        for (const [sessionId, session] of this.editingSessions) {
            if (session.userId === userId) {
                return { sessionId, ...session };
            }
        }
        return null;
    }
}

module.exports = UserHandler;
