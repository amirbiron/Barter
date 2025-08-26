require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const config = require('./config');
const keyboards = require('./keyboard');
const utils = require('./utils');
const UserHandler = require('./userHandler');

// אתחול בוט
const bot = new TelegramBot(config.bot.token, { 
    polling: {
        interval: config.bot.polling.interval,
        autoStart: config.bot.polling.autoStart,
        params: {
            timeout: config.bot.polling.timeout / 1000
        }
    }
});

console.log('🤖 הבוט מתחיל...');
console.log('📌 גרסה: fix-db-path-v2 - Use /tmp if persistent disk is readonly');

// הצג את הגדרות הסביבה החשובות
if (process.env.RENDER) {
    console.log('🌐 רץ על Render');
}
if (process.env.DATABASE_PATH) {
    console.log(`📁 נתיב מותאם אישית למסד נתונים: ${process.env.DATABASE_PATH}`);
}

// מצבי משתמשים (לשמירת context של שיחות)
const userStates = new Map();

// אתחול מנהל משתמשים
const userHandler = new UserHandler(bot);
userHandler.init();

// פונקציות עזר
function getUserState(userId) {
    return userStates.get(userId) || { step: 'main' };
}

function setUserState(userId, state) {
    userStates.set(userId, state);
}

function clearUserState(userId) {
    userStates.delete(userId);
}

// יצירת מקלדות - עכשיו מ-keyboards.js
function getMainKeyboard() {
    return keyboards.getMainKeyboard();
}

function getPricingKeyboard() {
    return keyboards.getPricingKeyboard();
}

function getBrowseKeyboard() {
    return keyboards.getBrowseKeyboard();
}

function getPostActionsKeyboard(postId) {
    return keyboards.getPostActionsKeyboard(postId);
}

// עיצוב הודעת מודעה - עכשיו מ-utils.js
function formatPostMessage(post, showContact = false) {
    return utils.formatFullPost(post, showContact);
}

// פקודות בסיסיות
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const param = match[1]; // פרמטר אופציונלי אחרי /start
    
    try {
        // שמירת פרטי משתמש
        await db.upsertUser(userId, msg.from.username, msg.from.first_name);
        
        // בדיקה אם יש פרמטר של מודעה
        if (param && param.startsWith('post_')) {
            const postId = parseInt(param.replace('post_', ''));
            const post = await db.getPost(postId);
            
            if (post && post.is_active) {
                // הצגת המודעה
                const postMessage = formatPostMessage(post);
                await bot.sendMessage(chatId, postMessage, {
                    parse_mode: 'Markdown',
                    ...getPostActionsKeyboard(postId)
                });
                
                // עדכון צפיות
                userHandler.trackInteraction(userId, postId, 'view');
                utils.logAction(userId, 'view_post_via_share', { postId });
                return;
            }
        }
        
        // הודעת ברכה רגילה
        await bot.sendMessage(chatId, config.messages.welcome, {
            ...getMainKeyboard(),
            parse_mode: 'Markdown'
        });
        
        clearUserState(userId);
        utils.logAction(userId, 'start_command');
        
    } catch (error) {
        utils.logError(error, 'start_command');
        await bot.sendMessage(chatId, config.messages.error);
    }
});

bot.onText(/\/help|ℹ️ עזרה/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, config.messages.help, { 
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// טיפול בהודעות טקסט (תפריט ראשי)
bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return; // התעלם מפקודות
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    try {
        // בדיקה אם המשתמש בתהליך עריכה
        if (userHandler.isEditingSession(userId)) {
            const handled = await userHandler.processEditInput(msg);
            if (handled) return;
        }
        
        // בדיקה אם המשתמש ממתין להזנת סיבת דיווח
        const userReportState = userHandler.userStates?.get(userId);
        if (userReportState?.action === 'awaiting_report_reason') {
            await userHandler.submitReport(userId, chatId, text);
            return;
        }
        
        const userState = getUserState(userId);
        
        // אם המשתמש באמצע תהליך פרסום
        if (userState.step !== 'main') {
            await handlePostCreation(msg, userState);
            return;
        }
        
        // תפריט ראשי
        switch (text) {
            case (config.bot.useEmojis ? '📝 ' : '') + 'פרסום שירות':
                await startPostCreation(chatId, userId);
                break;
                
            case (config.bot.useEmojis ? '🔍 ' : '') + 'חיפוש':
                await bot.sendMessage(chatId, '🔍 הקלידו מילות מפתח לחיפוש:', getMainKeyboard());
                setUserState(userId, { step: 'search' });
                break;
                
            case (config.bot.useEmojis ? '📱 ' : '') + 'דפדוף':
                await showBrowseOptions(chatId);
                break;
                
            case (config.bot.useEmojis ? '📋 ' : '') + 'המודעות שלי':
                await userHandler.showUserPostsDetailed(chatId, userId);
                break;
                
            case (config.bot.useEmojis ? '⭐ ' : '') + 'מועדפים':
                await userHandler.showSavedPosts(chatId, userId);
                break;
                
            default:
                // אם המשתמש במצב חיפוש
                if (userState.step === 'search') {
                    await handleSearch(chatId, text);
                    clearUserState(userId);
                } else {
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
        }
        
    } catch (error) {
        utils.logError(error, 'message_handler');
        await bot.sendMessage(chatId, config.messages.error);
        clearUserState(userId);
    }
});

// פונקציות עיקריות
async function startPostCreation(chatId, userId) {
    await bot.sendMessage(chatId, '📝 *בואו ניצור מודעה חדשה!*\n\nהקלידו את כותרת השירות:', { 
        parse_mode: 'Markdown' 
    });
    setUserState(userId, { step: 'title' });
}

async function handlePostCreation(msg, userState) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    switch (userState.step) {
        case 'title':
            // validation עם utils
            if (!text || text.trim().length < 3) {
                await bot.sendMessage(chatId, '❌ כותרת חייבת להכיל לפחות 3 תווים. נסו שוב:');
                return;
            }
            if (text.length > config.content.maxTitleLength) {
                await bot.sendMessage(chatId, `❌ כותרת ארוכה מדי (מקסימום ${config.content.maxTitleLength} תווים). נסו שוב:`);
                return;
            }
            
            setUserState(userId, { ...userState, step: 'description', title: utils.sanitizeText(text) });
            await bot.sendMessage(chatId, '📄 מצוין! כעת הקלידו תיאור מפורט של השירות:');
            break;
            
        case 'description':
            // validation עם utils
            if (!text || text.trim().length < 10) {
                await bot.sendMessage(chatId, '❌ תיאור חייב להכיל לפחות 10 תווים. נסו שוב:');
                return;
            }
            if (text.length > config.content.maxDescriptionLength) {
                await bot.sendMessage(chatId, `❌ תיאור ארוך מדי (מקסימום ${config.content.maxDescriptionLength} תווים). נסו שוב:`);
                return;
            }
            
            setUserState(userId, { ...userState, step: 'pricing', description: utils.sanitizeText(text) });
            await bot.sendMessage(chatId, '💡 איך אתם מעוניינים לקבל תמורה?', getPricingKeyboard());
            break;
            
        case 'price_range':
            const priceValidation = utils.validatePriceRange(text);
            if (!priceValidation.isValid) {
                await bot.sendMessage(chatId, `❌ ${priceValidation.error}\n\nנסו שוב או הקלידו "דלג":`);
                return;
            }
            
            setUserState(userId, { ...userState, step: 'portfolio', price_range: priceValidation.formatted });
            await bot.sendMessage(chatId, '🔗 הוסיפו קישורים לתיק עבודות או דף נחיתה (או הקלידו "דלג"):');
            break;
            
        case 'portfolio':
            const linkValidation = utils.validateLinks(text);
            const portfolioLinks = linkValidation.links.length > 0 ? linkValidation.links.join('\n') : null;
            
            setUserState(userId, { ...userState, step: 'contact', portfolio_links: portfolioLinks });
            await bot.sendMessage(chatId, '📞 הקלידו את פרטי הקשר שלכם (טלפון/אימייל/טלגרם):');
            break;
            
        case 'contact':
            const contactValidation = utils.validateContact(text);
            if (!contactValidation.isValid) {
                await bot.sendMessage(chatId, `❌ ${contactValidation.error}\n\nנסו שוב:`);
                return;
            }
            
            setUserState(userId, { ...userState, step: 'tags', contact_info: contactValidation.formatted });
            await bot.sendMessage(chatId, '🏷️ הוסיפו תגיות לשירות (הפרידו בפסיקים) או הקלידו "דלג":\n\nדוגמא: עיצוב, גרפיקה, לוגו');
            break;
            
        case 'tags':
            const tags = utils.validateTags(text === 'דלג' ? '' : text);
            await savePost(chatId, userId, { ...userState, tags });
            break;
    }
}

async function savePost(chatId, userId, postData) {
    try {
        // validation נוסף עם utils
        const validationErrors = config.validatePostData({
            title: postData.title,
            description: postData.description,
            pricingMode: postData.pricing_mode,
            contactInfo: postData.contact_info,
            tags: postData.tags
        });

        if (validationErrors.length > 0) {
            await bot.sendMessage(chatId, `❌ שגיאות בנתונים:\n• ${validationErrors.join('\n• ')}`);
            return;
        }

        const postId = await db.createPost({
            userId,
            title: utils.sanitizeText(postData.title),
            description: utils.sanitizeText(postData.description),
            pricingMode: postData.pricing_mode,
            priceRange: postData.price_range,
            portfolioLinks: postData.portfolio_links,
            contactInfo: postData.contact_info,
            tags: postData.tags
        });
        
        await bot.sendMessage(chatId, config.messages.postCreated, {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        });
        
        clearUserState(userId);
        utils.logAction(userId, 'post_created', { postId, title: postData.title });
        
    } catch (error) {
        utils.logError(error, 'save_post');
        await bot.sendMessage(chatId, config.messages.error);
        clearUserState(userId);
    }
}

async function handleSearch(chatId, query) {
    try {
        const results = await db.searchPosts(query);
        
        if (results.length === 0) {
            await bot.sendMessage(chatId, config.messages.noResults, getMainKeyboard());
            return;
        }
        
        await bot.sendMessage(chatId, `🔍 נמצאו ${results.length} תוצאות:`, getMainKeyboard());
        
        for (const post of results.slice(0, config.content.maxSearchResults)) {
            const message = formatPostMessage(post);
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                ...getPostActionsKeyboard(post.id)
            });
            
            // מעקב אחרי צפיות
            userHandler.trackInteraction(0, post.id, 'views'); // 0 = system user
        }
        
        if (results.length > config.content.maxSearchResults) {
            await bot.sendMessage(chatId, `📄 יש עוד ${results.length - config.content.maxSearchResults} תוצאות. חדדו את החיפוש לתוצאות טובות יותר.`);
        }
        
        utils.logAction(chatId, 'search', { query, resultsCount: results.length });
        
    } catch (error) {
        utils.logError(error, 'search_handler');
        await bot.sendMessage(chatId, config.messages.error);
    }
}

async function showBrowseOptions(chatId) {
    await bot.sendMessage(chatId, '📱 איך תרצו לדפדף?', getBrowseKeyboard());
}

async function showUserPosts(chatId, userId) {
    // מעביר ל-userHandler המתקדם יותר
    return userHandler.showUserPostsDetailed(chatId, userId);
}

// טיפול בלחיצות על כפתורים
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    try {
        await bot.answerCallbackQuery(callbackQuery.id);
        
        // ניתוב לפי סוג הפעולה
        if (data.startsWith('pricing_')) {
            await handlePricingSelection(chatId, userId, data);
        } else if (data.startsWith('browse_')) {
            // בדיקה אם זה חזרה למודעה ספציפית
            if (data.startsWith('browse_post_')) {
                const postId = parseInt(data.replace('browse_post_', ''));
                const post = await db.getPost(postId);
                
                if (post && post.is_active) {
                    const postMessage = formatPostMessage(post);
                    await bot.editMessageText(postMessage, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown',
                        ...getPostActionsKeyboard(postId)
                    });
                    userHandler.trackInteraction(userId, postId, 'view');
                } else {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'המודעה לא נמצאה',
                show_alert: false
            });
                }
            } else {
                await handleBrowseSelection(chatId, data);
            }
        } else if (data.startsWith('contact_')) {
            await userHandler.handleContactRequest(callbackQuery);
        } else if (data.startsWith('save_')) {
            await userHandler.handleSavePost(callbackQuery);
        } else if (data.startsWith('report_')) {
            await userHandler.handleReportPost(callbackQuery);
        } else if (data.startsWith('cancel_report_')) {
            await userHandler.cancelReport(callbackQuery);
        } else if (data.startsWith('share_')) {
            await userHandler.handleSharePost(callbackQuery);
        } else if (data.startsWith('share_own_')) {
            await userHandler.handleSharePost(callbackQuery);
        } else if (data.startsWith('edit_')) {
            // בדיקה איזה סוג של עריכה
            if (data.startsWith('edit_title_') || 
                data.startsWith('edit_desc_') || 
                data.startsWith('edit_pricing_') || 
                data.startsWith('edit_tags_') || 
                data.startsWith('edit_links_') || 
                data.startsWith('edit_contact_')) {
                await userHandler.handleEditField(callbackQuery);
            } else {
                await userHandler.startEditingPost(callbackQuery);
            }
        } else if (data.startsWith('back_to_post_')) {
            // חזרה מפרטי קשר למודעה
            const postId = parseInt(data.replace('back_to_post_', ''));
            const post = await db.getPost(postId);
            
            if (post && post.is_active) {
                const postMessage = formatPostMessage(post);
                await bot.editMessageText(postMessage, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    ...getPostActionsKeyboard(postId)
                });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'המודעה לא נמצאה',
                show_alert: false
            });
            }
        } else if (data.startsWith('copy_contact_')) {
            // העתקת פרטי קשר
            const postId = parseInt(data.replace('copy_contact_', ''));
            const post = await db.getPost(postId);
            
            if (post) {
                // זיהוי סוג פרטי הקשר והוספת הוראות מתאימות
                let instructions = '';
                const contact = post.contact_info;
                
                if (contact.includes('@') && contact.includes('.')) {
                    instructions = '📧 *אימייל:* לחצו על הטקסט למטה כדי להעתיק';
                } else if (contact.includes('+') || /\d{3}-?\d{3}-?\d{4}/.test(contact)) {
                    instructions = '📱 *טלפון:* לחצו על הטקסט למטה כדי להעתיק';
                } else if (contact.includes('t.me/') || contact.startsWith('@')) {
                    instructions = '💬 *טלגרם:* לחצו על הטקסט למטה כדי להעתיק';
                } else {
                    instructions = '📋 *פרטי קשר:* לחצו על הטקסט למטה כדי להעתיק';
                }
                
                // שליחת הודעה עם פרטי הקשר שאפשר להעתיק
                await bot.sendMessage(chatId, 
                    `${instructions}\n\n\`${contact}\`\n\n_טיפ: אפשר גם ללחוץ לחיצה ארוכה על הטקסט ולבחור "העתק"_`,
                    { parse_mode: 'Markdown' }
                );
                await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'פרטי הקשר נשלחו בהודעה נפרדת',
                show_alert: false
            });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'לא ניתן למצוא את פרטי הקשר',
                show_alert: false
            });
            }
        } else if (data.startsWith('toggle_')) {
            await userHandler.togglePostStatus(callbackQuery);
        } else if (data.startsWith('delete_')) {
            await userHandler.confirmDeletePost(callbackQuery);
        } else if (data.startsWith('confirm_delete_')) {
            await userHandler.executeDeletePost(callbackQuery);
        } else if (data.startsWith('cancel_delete_')) {
            // ביטול מחיקה - חזרה למודעות שלי
            await userHandler.showUserPostsDetailed(chatId, userId);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: 'המחיקה בוטלה',
                show_alert: false
            });
        } else if (data.startsWith('stats_')) {
            await userHandler.showPostStats(callbackQuery);
        } else if (data === 'back_to_my_posts') {
            await userHandler.showUserPostsDetailed(chatId, userId);
        } else if (data === 'back_to_main') {
            await bot.editMessageText('🎯 חזרתם לתפריט הראשי', {
                chat_id: chatId,
                message_id: msg.message_id
            });
            clearUserState(userId);
        } else {
            await bot.answerCallbackQuery(callbackQuery.id, config.messages.featureInDevelopment);
        }
        
        utils.logAction(userId, 'callback_query', { action: data });
        
    } catch (error) {
        utils.logError(error, 'callback_query_handler');
        await bot.answerCallbackQuery(callbackQuery.id, config.messages.error);
    }
});

async function handlePricingSelection(chatId, userId, data) {
    const pricingMode = data.replace('pricing_', '');
    const userState = getUserState(userId);
    
    setUserState(userId, { ...userState, pricing_mode: pricingMode });
    
    if (pricingMode === 'payment' || pricingMode === 'both') {
        await bot.sendMessage(chatId, '💵 הקלידו את טווח המחיר (דוגמא: "100-500 ש״ח" או הקלידו "דלג"):');
        setUserState(userId, { ...userState, step: 'price_range', pricing_mode: pricingMode });
    } else {
        await bot.sendMessage(chatId, '🔗 הוסיפו קישורים לתיק עבודות או דף נחיתה (או הקלידו "דלג"):');
        setUserState(userId, { ...userState, step: 'portfolio', pricing_mode: pricingMode });
    }
    
    utils.logAction(userId, 'select_pricing', { mode: pricingMode });
}

async function handleBrowseSelection(chatId, data) {
    const browseType = data.replace('browse_', '');
    
    try {
        let filter = {};
        if (browseType !== 'all') {
            filter.pricingMode = browseType;
        }
        
        const posts = await db.getRecentPosts(config.content.maxBrowseResults, filter);
        
        if (posts.length === 0) {
            await bot.sendMessage(chatId, '📱 אין מודעות זמינות בקטגוריה זו כרגע.');
            return;
        }
        
        const categoryName = browseType === 'all' ? 'כל המודעות' :
                           browseType === 'barter' ? 'מודעות בארטר' : 'מודעות בתשלום';
        
        await bot.sendMessage(chatId, `📱 *${categoryName} (${posts.length} אחרונות):*`, { 
            parse_mode: 'Markdown' 
        });
        
        for (const post of posts) {
            const message = formatPostMessage(post);
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                ...getPostActionsKeyboard(post.id)
            });
            
            // מעקב אחרי צפיות
            userHandler.trackInteraction(0, post.id, 'views'); // 0 = system user
            
            // השהייה קטנה למניעת spam
            await utils.sleep(100);
        }
        
        utils.logAction(chatId, 'browse', { type: browseType, resultsCount: posts.length });
        
    } catch (error) {
        utils.logError(error, 'browse_selection');
        await bot.sendMessage(chatId, config.messages.error);
    }
}

// טיפול בשגיאות וסגירה נקייה
bot.on('polling_error', (error) => {
    utils.logError(error, 'bot_polling');
});

bot.on('error', (error) => {
    utils.logError(error, 'bot_general');
});

// סגירה נקייה של הבוט
async function gracefulShutdown(signal) {
    console.log(`\n🛑 קיבלנו ${signal}, סוגרים את הבוט בצורה נקייה...`);
    
    try {
        // עדכון משתמשים על תחזוקה
        if (config.security.adminUserIds.length > 0) {
            for (const adminId of config.security.adminUserIds) {
                try {
                    await bot.sendMessage(adminId, '🔧 הבוט נכנס למצב תחזוקה...');
                } catch (adminError) {
                    // מתעלם משגיאות שליחה למנהלים
                }
            }
        }
        
        // ניקוי משאבים
        userStates.clear();
        if (userHandler) {
            userHandler.cleanup();
        }
        
        // סגירת בסיס הנתונים
        await db.close();
        
        // עצירת הpolling
        await bot.stopPolling();
        
        console.log('✅ הבוט נסגר בהצלחה');
        process.exit(0);
        
    } catch (error) {
        utils.logError(error, 'graceful_shutdown');
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// בדיקת סביבת הפעלה
const envValidation = utils.validateEnvironment();
if (!envValidation.isValid) {
    console.error('❌ בעיות בסביבת הפעלה:');
    envValidation.issues.forEach(issue => console.error(`   • ${issue}`));
    process.exit(1);
}

console.log('✅ הבוט פועל ומוכן לקבלת הודעות!');
console.log(`🔧 מצב debug: ${config.bot.debugMode ? 'פעיל' : 'כבוי'}`);
console.log(`🗃️ מיקום DB: ${config.database.path}`);

if (config.bot.debugMode) {
    console.log('📊 מידע מערכת:', JSON.stringify(utils.getSystemInfo(), null, 2));
}

// הוספת שרת HTTP פשוט כדי שהדיפלוי יזהה פורט פתוח
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'telegram-barter-bot',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 שרת HTTP מאזין על פורט ${PORT}`);
    console.log(`✅ Health check זמין ב: http://localhost:${PORT}/health`);
});
