const config = require('./config');

// ===============================================
// ⌨️ Keyboard Layouts Manager
// ===============================================

class KeyboardManager {
    constructor() {
        this.emojis = config.bot.useEmojis;
    }

    // 🏠 תפריט ראשי
    getMainKeyboard() {
        const e = config.bot.useEmojis;
        
        return {
            reply_markup: {
                keyboard: [
                    [`${e ? '📝 ' : ''}פרסום שירות`, `${e ? '🔍 ' : ''}חיפוש`],
                    [`${e ? '📱 ' : ''}דפדוף`, `${e ? '📋 ' : ''}המודעות שלי`],
                    [`${e ? '⭐ ' : ''}מועדפים`, `${e ? '🔔 ' : ''}התראות`],
                    [`${e ? 'ℹ️ ' : ''}עזרה`]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
    }

    // 💡 בחירת מצב תמחור
    getPricingKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${e ? '🫱🏻‍🫲🏽 ' : ''}בארטר`, callback_data: 'pricing_barter' }],
                    [{ text: `${e ? '💰 ' : ''}תשלום`, callback_data: 'pricing_payment' }],
                    [{ text: `${e ? '🫱🏻‍🫲🏽💰 ' : ''}שניהם`, callback_data: 'pricing_both' }],
                    [{ text: `${e ? '🆓 ' : ''}חינם`, callback_data: 'pricing_free' }],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // 📱 אפשרויות דפדוף
    getBrowseKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '🫱🏻‍🫲🏽 ' : ''}בארטר`, callback_data: 'browse_barter' },
                        { text: `${e ? '💰 ' : ''}תשלום`, callback_data: 'browse_payment' }
                    ],
                    [
                        { text: `${e ? '🆓 ' : ''}חינם`, callback_data: 'browse_free' },
                        { text: `${e ? '📋 ' : ''}הכל`, callback_data: 'browse_all' }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}תפריט ראשי`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // 📄 פעולות על מודעה (בזמן צפייה)
    getPostActionsKeyboard(postId) {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '📞 ' : ''}צור קשר`, callback_data: `contact_${postId}` },
                        { text: `${e ? '⭐ ' : ''}שמור`, callback_data: `save_${postId}` }
                    ],
                    [
                        { text: `${e ? '🚨 ' : ''}דווח`, callback_data: `report_${postId}` },
                        { text: `${e ? '📤 ' : ''}שתף`, callback_data: `share_${postId}` }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_browse' }]
                ]
            }
        };
    }

    // 📄 פעולות על מודעה עם סטטוס שמירה
    getPostActionsKeyboardWithSaveStatus(postId, isSaved = false) {
        const e = this.emojis;
        const saveButtonText = isSaved ? 
            `${e ? '💔 ' : ''}הסר ממועדפים` : 
            `${e ? '⭐ ' : ''}שמור`;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '📞 ' : ''}צור קשר`, callback_data: `contact_${postId}` },
                        { text: saveButtonText, callback_data: `save_${postId}` }
                    ],
                    [
                        { text: `${e ? '🚨 ' : ''}דווח`, callback_data: `report_${postId}` },
                        { text: `${e ? '📤 ' : ''}שתף`, callback_data: `share_${postId}` }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_browse' }]
                ]
            }
        };
    }

    // 📋 ניהול מודעות של המשתמש
    getUserPostActionsKeyboard(postId, isActive = true) {
        const e = this.emojis;
        
        const buttons = [
            [
                { text: `${e ? '✏️ ' : ''}ערוך`, callback_data: `edit_${postId}` },
                { 
                    text: isActive ? `${e ? '⏸️ ' : ''}הקפא` : `${e ? '▶️ ' : ''}הפעל`, 
                    callback_data: `toggle_${postId}` 
                }
            ],
            [
                { text: `${e ? '📊 ' : ''}סטטיסטיקה`, callback_data: `stats_${postId}` }
            ]
        ];
        
        // הוסף כפתור שתף רק למודעות פעילות
        if (isActive) {
            buttons[1].push({ text: `${e ? '🔗 ' : ''}שתף`, callback_data: `share_own_${postId}` });
        }
        
        // הוסף כפתורי מחיקה וחזרה
        buttons.push(
            [{ text: `${e ? '🗑️ ' : ''}מחק`, callback_data: `delete_${postId}` }],
            [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_my_posts' }]
        );
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    // ✏️ אישור עריכת מודעה
    getEditConfirmKeyboard(postId) {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '📝 ' : ''}כותרת`, callback_data: `edit_title_${postId}` },
                        { text: `${e ? '📄 ' : ''}תיאור`, callback_data: `edit_desc_${postId}` }
                    ],
                    [
                        { text: `${e ? '💰 ' : ''}תמחור`, callback_data: `edit_pricing_${postId}` },
                        { text: `${e ? '🏷️ ' : ''}תגיות`, callback_data: `edit_tags_${postId}` }
                    ],
                    [
                        { text: `${e ? '🔗 ' : ''}קישורים`, callback_data: `edit_links_${postId}` },
                        { text: `${e ? '📞 ' : ''}קשר`, callback_data: `edit_contact_${postId}` }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}ביטול`, callback_data: `back_to_post_${postId}` }]
                ]
            }
        };
    }

    // 🗑️ אישור מחיקה
    getDeleteConfirmKeyboard(postId) {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '✅ ' : ''}כן, מחק`, callback_data: `confirm_delete_${postId}` },
                        { text: `${e ? '❌ ' : ''}ביטול`, callback_data: `cancel_delete_${postId}` }
                    ]
                ]
            }
        };
    }

    // 🔍 סינוני חיפוש מתקדם
    getSearchFiltersKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${e ? '🔍 ' : ''}חיפוש חופשי`, callback_data: 'search_free' }],
                    [
                        { text: `${e ? '🫱🏻‍🫲🏽 ' : ''}רק בארטר`, callback_data: 'search_barter' },
                        { text: `${e ? '💰 ' : ''}רק תשלום`, callback_data: 'search_payment' }
                    ],
                    [{ text: `${e ? '🏷️ ' : ''}חיפוש בתגיות`, callback_data: 'search_tags' }],
                    [
                        { text: `${e ? '📅 ' : ''}היום`, callback_data: 'search_today' },
                        { text: `${e ? '📆 ' : ''}השבוע`, callback_data: 'search_week' }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // 📞 פעולות פרטי קשר
    getContactActionsKeyboard(postId, contactInfo) {
        const e = this.emojis;
        
        console.log(`[DEBUG] Contact info for post ${postId}: "${contactInfo}"`);
        
        const buttons = [];
        
        // תמיד מוסיפים כפתור העתקה - זה הכי אוניברסלי
        buttons.push([{ text: `${e ? '📋 ' : ''}העתק פרטי קשר`, callback_data: `copy_contact_${postId}` }]);
        
        // כפתור חזרה
        buttons.push([{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: `back_to_post_${postId}` }]);
        
        console.log(`[DEBUG] Final buttons structure:`, JSON.stringify(buttons, null, 2));
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    // 📊 ניווט דפים (pagination)
    getPaginationKeyboard(currentPage, totalPages, baseCallback) {
        const e = this.emojis;
        const buttons = [];
        
        if (totalPages <= 1) return null;
        
        // שורה ראשונה - ניווט מהיר
        const firstRow = [];
        if (currentPage > 1) {
            firstRow.push({ text: `${e ? '⏮️' : '<<'}`, callback_data: `${baseCallback}_page_1` });
            firstRow.push({ text: `${e ? '◀️' : '<'}`, callback_data: `${baseCallback}_page_${currentPage - 1}` });
        }
        
        firstRow.push({ text: `📄 עמוד ${currentPage}`, callback_data: 'noop' });
        
        if (currentPage < totalPages) {
            firstRow.push({ text: `${e ? '▶️' : '>'}`, callback_data: `${baseCallback}_page_${currentPage + 1}` });
            firstRow.push({ text: `${e ? '⏭️' : '>>'}`, callback_data: `${baseCallback}_page_${totalPages}` });
        }
        
        buttons.push(firstRow);
        
        // שורה שנייה - קפיצה למספר עמוד
        if (totalPages > 3) {
            const jumpRow = [];
            const pagesToShow = Math.min(5, totalPages);
            const startPage = Math.max(1, currentPage - Math.floor(pagesToShow / 2));
            const endPage = Math.min(totalPages, startPage + pagesToShow - 1);
            
            for (let i = startPage; i <= endPage; i++) {
                if (i !== currentPage) {
                    jumpRow.push({ text: `${i}`, callback_data: `${baseCallback}_page_${i}` });
                }
            }
            
            if (jumpRow.length > 0) {
                buttons.push(jumpRow);
            }
        }
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    // 🎯 מקלדת אישור כללית
    getConfirmKeyboard(actionCallback, cancelCallback = 'back_to_main') {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '✅ ' : ''}כן`, callback_data: actionCallback },
                        { text: `${e ? '❌ ' : ''}לא`, callback_data: cancelCallback }
                    ]
                ]
            }
        };
    }

    // 🔄 מקלדת רענון
    getRefreshKeyboard(refreshCallback) {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${e ? '🔄 ' : ''}רענן`, callback_data: refreshCallback }],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // ⚙️ מקלדת הגדרות משתמש (לעתיד)
    getUserSettingsKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '🔔 ' : ''}התראות`, callback_data: 'settings_notifications' },
                        { text: `${e ? '🌐 ' : ''}שפה`, callback_data: 'settings_language' }
                    ],
                    [
                        { text: `${e ? '🎨 ' : ''}ממשק`, callback_data: 'settings_ui' },
                        { text: `${e ? '🔐 ' : ''}פרטיות`, callback_data: 'settings_privacy' }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // 🏷️ מקלדת תגיות פופולריות (לעתיד)
    getPopularTagsKeyboard(tags = []) {
        const e = this.emojis;
        const buttons = [];
        
        // חלוקה לשורות של 2-3 תגיות
        for (let i = 0; i < tags.length; i += 3) {
            const row = tags.slice(i, i + 3).map(tag => ({
                text: `${e ? '🏷️ ' : '#'}${tag}`,
                callback_data: `tag_${tag}`
            }));
            buttons.push(row);
        }
        
        buttons.push([{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: 'back_to_main' }]);
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    // 📈 מקלדת סטטיסטיקות
    getStatsKeyboard(postId) {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${e ? '👁️ ' : ''}צפיות`, callback_data: `stats_views_${postId}` },
                        { text: `${e ? '📞 ' : ''}פניות`, callback_data: `stats_contacts_${postId}` }
                    ],
                    [
                        { text: `${e ? '⭐ ' : ''}שמירות`, callback_data: `stats_saves_${postId}` },
                        { text: `${e ? '📤 ' : ''}שיתופים`, callback_data: `stats_shares_${postId}` }
                    ],
                    [{ text: `${e ? '🔙 ' : ''}חזרה`, callback_data: `back_to_post_${postId}` }]
                ]
            }
        };
    }

    // 🔔 תפריט התראות
    getAlertsMenuKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${e ? '➕ ' : ''}הוסף מילת מפתח`, callback_data: 'alert_add_keyword' }],
                    [{ text: `${e ? '📋 ' : ''}הצג מילות מפתח`, callback_data: 'alert_show_keywords' }],
                    [{ text: `${e ? '🗑️ ' : ''}מחק מילת מפתח`, callback_data: 'alert_remove_keyword' }],
                    [{ text: `${e ? '🔄 ' : ''}החלף את כל המילות`, callback_data: 'alert_replace_all' }],
                    [{ text: `${e ? '🔙 ' : ''}תפריט ראשי`, callback_data: 'back_to_main' }]
                ]
            }
        };
    }

    // 🔔 כפתורי ניהול מילות מפתח
    getKeywordManagementKeyboard(keywords = []) {
        const e = this.emojis;
        const buttons = [];
        
        // יצירת כפתורים למילות המפתח הקיימות
        for (let i = 0; i < keywords.length; i += 2) {
            const row = [];
            row.push({ 
                text: `❌ ${keywords[i].keyword}`, 
                callback_data: `alert_delete_${keywords[i].keyword.substring(0, 20)}` 
            });
            
            if (keywords[i + 1]) {
                row.push({ 
                    text: `❌ ${keywords[i + 1].keyword}`, 
                    callback_data: `alert_delete_${keywords[i + 1].keyword.substring(0, 20)}` 
                });
            }
            buttons.push(row);
        }
        
        // הוספת כפתור חזרה
        buttons.push([{ text: `${e ? '🔙 ' : ''}חזרה להתראות`, callback_data: 'alert_menu' }]);
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    // כפתור ביטול פעולה
    getCancelKeyboard() {
        const e = this.emojis;
        
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${e ? '❌ ' : ''}ביטול`, callback_data: 'cancel_operation' }]
                ]
            }
        };
    }

    // 🎯 פונקציות עזר

    // הסרת מקלדת inline
    removeInlineKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: []
            }
        };
    }

    // הסתרת מקלדת רגילה
    removeReplyKeyboard() {
        return {
            reply_markup: {
                remove_keyboard: true
            }
        };
    }

    // בדיקה אם callback_data תקין
    isValidCallbackData(data) {
        return data && typeof data === 'string' && data.length <= 64;
    }

    // קבלת פעולה מתוך callback_data
    getActionFromCallback(callbackData) {
        if (!callbackData) return null;
        
        const parts = callbackData.split('_');
        return {
            action: parts[0],
            target: parts[1],
            id: parts[2] ? parseInt(parts[2]) : null,
            extra: parts.slice(3).join('_')
        };
    }
}

// יצירת instance יחיד
const keyboards = new KeyboardManager();

module.exports = keyboards;
