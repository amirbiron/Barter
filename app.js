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
console.log('📌 גרסה: fix-all-issues-v3 - Fixed back button, persistent disk path, and deprecated callbacks');

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

// פקודת עזרה
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    let helpMessage = config.messages.help;
    
    // הוספת פקודות מנהל אם המשתמש הוא מנהל
    if (config.isAdmin(userId)) {
        helpMessage += '\n\n*🔧 פקודות מנהל:*\n';
        helpMessage += '• /testpost - יצירת מודעת בדיקה פרטית\n';
        helpMessage += '• /stats - סטטיסטיקות המערכת';
    }
    
    await bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// פקודת מנהל - יצירת מודעת בדיקה
bot.onText(/\/testpost/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // בדיקת הרשאות
    if (!config.isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ פקודה זו זמינה למנהלים בלבד');
        return;
    }
    
    await bot.sendMessage(chatId, '🔧 *יצירת מודעת בדיקה (פרטית)*\n\nהקלידו את כותרת המודעה:', { 
        parse_mode: 'Markdown' 
    });
    setUserState(userId, { step: 'title', isTestPost: true });
});

// טיפול בהודעות טקסט (תפריט ראשי)
bot.on('message', async (msg) => {
    // אם זו פקודה, דלג (הטיפול בפקודות למעלה)
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // לוגים לאבחון
    console.log(`📨 קיבלתי הודעה מ-${userId}: "${text}"`);
    console.log(`🔧 config.bot.useEmojis = ${config.bot.useEmojis}`);
    
    // בדיקת מצב המשתמש
    const userState = getUserState(userId);
    console.log(`👤 מצב משתמש ${userId}:`, userState);
    
    try {
        // בדיקה אם המשתמש נמצא באמצע עריכת מודעה
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
        
        // אם המשתמש באמצע תהליך פרסום
        if (userState.step && userState.step !== 'main' && userState.step !== 'search') {
            console.log(`📝 משתמש ${userId} באמצע תהליך פרסום, step: ${userState.step}`);
            await handlePostCreation(msg, userState);
            return;
        }
        
        // בדיקת טקסט הכפתור עם לוג
        const searchButtonText = (config.bot.useEmojis ? '🔍 ' : '') + 'חיפוש';
        console.log(`🔍 השוואת כפתור חיפוש: "${text}" === "${searchButtonText}" ? ${text === searchButtonText}`);
        
        switch (text) {
            case (config.bot.useEmojis ? '📝 ' : '') + 'פרסום שירות':
                console.log('✅ זוהה: פרסום שירות');
                await startPostCreation(chatId, userId);
                break;
                
            case searchButtonText:
                console.log('✅ זוהה: חיפוש');
                await bot.sendMessage(chatId, '🔍 בחרו סוג חיפוש:', {
                    reply_markup: {
                        keyboard: [
                            ['📌 חיפוש בכותרות בלבד'],
                            ['🔍 חיפוש מלא (כותרת + תיאור + תגיות)'],
                            ['🔙 חזרה']
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
                setUserState(userId, { step: 'search_type' });
                break;
                
            case '📌 חיפוש בכותרות בלבד':
                if (userState.step === 'search_type') {
                    console.log('📌 נבחר חיפוש בכותרות');
                    await bot.sendMessage(chatId, '📌 הקלידו מילות מפתח לחיפוש בכותרות:', {
                        reply_markup: {
                            keyboard: [['🔙 חזרה']],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                    setUserState(userId, { step: 'search_titles' });
                } else {
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
                break;
                
            case '🔍 חיפוש מלא (כותרת + תיאור + תגיות)':
                if (userState.step === 'search_type') {
                    console.log('🔍 נבחר חיפוש מלא');
                    await bot.sendMessage(chatId, '🔍 הקלידו מילות מפתח לחיפוש מלא:', {
                        reply_markup: {
                            keyboard: [['🔙 חזרה']],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                    setUserState(userId, { step: 'search_full' });
                } else {
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
                break;
                
            case (config.bot.useEmojis ? '📱 ' : '') + 'דפדוף':
                console.log('✅ זוהה: דפדוף');
                await showBrowseOptions(chatId);
                break;
                
            case (config.bot.useEmojis ? '📋 ' : '') + 'המודעות שלי':
                console.log('✅ זוהה: המודעות שלי');
                await userHandler.showUserPostsDetailed(chatId, userId);
                break;
                
            case (config.bot.useEmojis ? '⭐ ' : '') + 'מועדפים':
                console.log('✅ זוהה: מועדפים');
                await userHandler.showSavedPosts(chatId, userId);
                break;
                
            case (config.bot.useEmojis ? 'ℹ️ ' : '') + 'עזרה':
                console.log('✅ זוהה: עזרה');
                await bot.sendMessage(chatId, config.messages.help, {
                    parse_mode: 'Markdown',
                    ...getMainKeyboard()
                });
                break;
                
            case '🔙 חזרה':
                // חזרה לשלב הקודם או לתפריט הראשי
                if (userState.step === 'search_type') {
                    console.log('🔙 חזרה לתפריט ראשי מבחירת סוג חיפוש');
                    clearUserState(userId);
                    await bot.sendMessage(chatId, '✅ חזרה לתפריט ראשי', getMainKeyboard());
                } else if (userState.step === 'search_titles' || userState.step === 'search_full') {
                    console.log('🔙 חזרה לבחירת סוג חיפוש');
                    await bot.sendMessage(chatId, '🔍 בחרו סוג חיפוש:', {
                        reply_markup: {
                            keyboard: [
                                ['📌 חיפוש בכותרות בלבד'],
                                ['🔍 חיפוש מלא (כותרת + תיאור + תגיות)'],
                                ['🔙 חזרה']
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                    setUserState(userId, { step: 'search_type' });
                } else {
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
                break;
                
            case '❌ ביטול':
                // שמירה על תמיכה לאחור - אם מישהו עדיין משתמש בגרסה ישנה
                if (userState.step === 'search' || userState.step === 'search_type' || 
                    userState.step === 'search_titles' || userState.step === 'search_full') {
                    console.log('❌ ביטול חיפוש');
                    clearUserState(userId);
                    await bot.sendMessage(chatId, '✅ החיפוש בוטל', getMainKeyboard());
                } else {
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
                break;
                
            default:
                console.log('❓ לא זוהה כפתור, בודק מצב משתמש...');
                // אם המשתמש במצב חיפוש
                if (userState.step === 'search_titles') {
                    console.log('📌 משתמש במצב חיפוש כותרות, מבצע חיפוש...');
                    await handleTitleSearch(chatId, text);
                    clearUserState(userId);
                } else if (userState.step === 'search_full') {
                    console.log('🔍 משתמש במצב חיפוש מלא, מבצע חיפוש...');
                    await handleSearch(chatId, text);
                    clearUserState(userId);
                } else if (userState.step === 'search') {
                    // תמיכה לאחור - חיפוש רגיל ישן
                    console.log('🔍 משתמש במצב חיפוש (ישן), מבצע חיפוש...');
                    await handleSearch(chatId, text);
                    clearUserState(userId);
                } else {
                    console.log('⚠️ פקודה לא מוכרת');
                    await bot.sendMessage(chatId, config.messages.unknownCommand, getMainKeyboard());
                }
        }
    } catch (error) {
        console.error('❌ שגיאה בטיפול בהודעה:', error);
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
            
            // בדיקה אם המשתמש הוא מנהל
            if (config.isAdmin(userId)) {
                setUserState(userId, { ...userState, step: 'visibility', tags });
                
                // שלב visibility - רק למנהלים
                await bot.sendMessage(chatId, '🔐 האם המודעה תהיה ציבורית או פרטית?\n\n' +
                    '• *ציבורית* - כולם יוכלו לראות את המודעה\n' +
                    '• *פרטית* - מודעת בדיקה (רק למנהלים)', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🌍 ציבורית', callback_data: 'visibility_public' }],
                            [{ text: '🔒 פרטית (בדיקה)', callback_data: 'visibility_private' }]
                        ]
                    }
                });
            } else {
                // משתמשים רגילים - ישר לשמירה כמודעה ציבורית
                await savePost(chatId, userId, { ...userState, tags, visibility: 'public' });
            }
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

        // אם זו מודעת בדיקה מפקודת /testpost
        const visibility = postData.isTestPost ? 'private' : (postData.visibility || 'public');

        const postId = await db.createPost({
            userId,
            title: utils.sanitizeText(postData.title),
            description: utils.sanitizeText(postData.description),
            pricingMode: postData.pricing_mode,
            priceRange: postData.price_range,
            portfolioLinks: postData.portfolio_links,
            contactInfo: postData.contact_info,
            tags: postData.tags,
            visibility: visibility
        });
        
        const visibilityMessage = visibility === 'private' ? 
            '\n\n🔒 *מודעת בדיקה נשמרה* - לא תופיע בחיפושים' : '';
        
        await bot.sendMessage(chatId, config.messages.postCreated + visibilityMessage, {
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
    console.log(`🔍 handleSearch נקראת עבור chatId: ${chatId}, query: "${query}"`);
    
    try {
        const results = await db.searchPosts(query);
        console.log(`📊 תוצאות חיפוש: ${results.length} מודעות נמצאו`);
        
        if (results.length === 0) {
            console.log('❌ לא נמצאו תוצאות');
            await bot.sendMessage(chatId, config.messages.noResults, getMainKeyboard());
            return;
        }
        
        await bot.sendMessage(chatId, `🔍 נמצאו ${results.length} תוצאות:`, getMainKeyboard());
        
        const maxResults = config.content.maxSearchResults || 5;
        console.log(`📤 מציג ${Math.min(results.length, maxResults)} תוצאות מתוך ${results.length}`);
        
        for (const post of results.slice(0, maxResults)) {
            console.log(`  - מציג מודעה ID: ${post.id}, כותרת: ${post.title}`);
            const message = formatPostMessage(post);
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                ...getPostActionsKeyboard(post.id)
            });
            
            // מעקב אחרי צפיות
            userHandler.trackInteraction(0, post.id, 'views'); // 0 = system user
        }
        
        if (results.length > maxResults) {
            await bot.sendMessage(chatId, `📄 יש עוד ${results.length - maxResults} תוצאות. חדדו את החיפוש לתוצאות טובות יותר.`);
        }
        
        utils.logAction(chatId, 'search', { query, resultsCount: results.length });
        console.log('✅ חיפוש הושלם בהצלחה');
        
    } catch (error) {
        console.error('❌ שגיאה בחיפוש:', error);
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

async function handleTitleSearch(chatId, query) {
    console.log(`📌 handleTitleSearch נקראת עבור chatId: ${chatId}, query: "${query}"`);
    
    try {
        // חיפוש בכותרות בלבד
        const results = await db.searchPostsByTitle(query);
        console.log(`📊 תוצאות חיפוש כותרות: ${results.length} מודעות נמצאו`);
        
        if (results.length === 0) {
            console.log('❌ לא נמצאו תוצאות');
            await bot.sendMessage(chatId, '❌ לא נמצאו תוצאות התואמות לחיפוש', getMainKeyboard());
            return;
        }
        
        // יצירת כפתורי inline עבור כל תוצאה
        const maxResults = 10; // מגבלת תוצאות לתצוגה
        const buttons = results.slice(0, maxResults).map(post => [{
            text: `${post.pricing_mode === 'barter' ? '🔄' : post.pricing_mode === 'payment' ? '💰' : '🔄💰'} ${post.title}`,
            callback_data: `view_post_${post.id}`
        }]);
        
        // הוספת כפתור "חזרה לתפריט"
        buttons.push([{ text: '🔙 חזרה לתפריט ראשי', callback_data: 'back_to_main' }]);
        
        const message = `📌 נמצאו ${results.length} תוצאות לחיפוש "${query}":\n\n` +
            `${results.length > maxResults ? `מוצגות ${maxResults} תוצאות ראשונות\n` : ''}` +
            `לחצו על כותרת כדי לצפות במודעה המלאה:`;
        
        await bot.sendMessage(chatId, message, {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
        
        // חזרה לתפריט ראשי
        await bot.sendMessage(chatId, '✅ בחרו מודעה מהרשימה או חזרו לתפריט', getMainKeyboard());
        
        utils.logAction(chatId, 'search_titles', { query, resultsCount: results.length });
        console.log('✅ חיפוש כותרות הושלם בהצלחה');
        
    } catch (error) {
        console.error('❌ שגיאה בחיפוש כותרות:', error);
        utils.logError(error, 'title_search_handler');
        await bot.sendMessage(chatId, config.messages.error, getMainKeyboard());
    }
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
        } else if (data.startsWith('visibility_')) {
            await handleVisibilitySelection(chatId, userId, data);
        } else if (data.startsWith('view_post_')) {
            // Handler for viewing posts from browse list or search results
            const parts = data.split('_');
            const postId = parseInt(parts[2]);
            const fromBrowse = parts[3] === 'from';
            
            if (fromBrowse) {
                // Extract browse context (browse type and page)
                const browseType = parts[5];
                const page = parts[6] || 1;
                
                const post = await db.getPost(postId);
                
                if (post && post.is_active) {
                    const postMessage = formatPostMessage(post);
                    
                    // Create custom keyboard with back to browse button
                    const e = config.bot.useEmojis;
                    const keyboard = {
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
                                [{ text: `${e ? '🔙 ' : ''}חזרה לרשימה`, callback_data: `browse_${browseType}_page_${page}` }]
                            ]
                        }
                    };
                    
                    await bot.editMessageText(postMessage, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                    
                    // Track view
                    userHandler.trackInteraction(userId, postId, 'view');
                } else {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: 'המודעה לא נמצאה',
                        show_alert: false
                    });
                }
            } else {
                // View post from search results (not from browse)
                const post = await db.getPost(postId);
                
                if (post && post.is_active) {
                    const postMessage = formatPostMessage(post);
                    
                    // Send as new message with full post actions keyboard
                    await bot.sendMessage(chatId, postMessage, {
                        parse_mode: 'Markdown',
                        ...getPostActionsKeyboard(postId)
                    });
                    
                    // Track view
                    userHandler.trackInteraction(userId, postId, 'view');
                    utils.logAction(userId, 'view_post_from_search', { postId });
                } else {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: 'המודעה לא נמצאה',
                        show_alert: true
                    });
                }
            }
        } else if (data === 'back_to_browse_options') {
            // Return to browse options menu
            await bot.editMessageText('📱 איך תרצו לדפדף?', {
                chat_id: chatId,
                message_id: msg.message_id,
                ...getBrowseKeyboard()
            });
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
                await handleBrowseSelection(chatId, data, msg.message_id);
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
            // חזרה למודעה - בודק מאיפה באנו
            const postId = parseInt(data.replace('back_to_post_', ''));
            const post = await db.getPost(postId);
            
            if (post) {
                // אם זו המודעה של המשתמש, הצג עם כפתורי ניהול
                if (post.user_id === userId) {
                    const message = utils.formatPostPreview(post);
                    const keyboard = keyboards.getUserPostActionsKeyboard(post.id, post.is_active);
                    
                    await bot.editMessageText(message, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                } else {
                    // אם זו מודעה של מישהו אחר, הצג עם כפתורי צפייה
                    const postMessage = formatPostMessage(post);
                    await bot.editMessageText(postMessage, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown',
                        ...getPostActionsKeyboard(postId)
                    });
                }
                
                await bot.answerCallbackQuery(callbackQuery.id);
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
                    instructions = '📧 *אימייל:* לחצו על הפרטים למטה - לחיצה קצרה - כדי להעתיק';
                } else if (contact.includes('+') || /\d{3}-?\d{3}-?\d{4}/.test(contact)) {
                    instructions = '📱 *טלפון:* לחצו על הפרטים למטה - לחיצה קצרה - כדי להעתיק';
                } else if (contact.includes('t.me/') || contact.startsWith('@')) {
                    instructions = '💬 *טלגרם:* לחצו על הפרטים למטה - לחיצה קצרה - כדי להעתיק';
                } else {
                    instructions = '📋 *פרטי קשר:* לחצו על הפרטים למטה - לחיצה קצרה - כדי להעתיק';
                }
                
                // שליחת הודעה עם פרטי הקשר שאפשר להעתיק
                await bot.sendMessage(chatId, 
                    `${instructions}\n\n\`${contact}\``,
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
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: config.messages.featureInDevelopment,
                show_alert: false
            });
        }
        
        utils.logAction(userId, 'callback_query', { action: data });
        
    } catch (error) {
        utils.logError(error, 'callback_query_handler');
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: config.messages.error,
            show_alert: true
        });
    }
});

async function handleVisibilitySelection(chatId, userId, data) {
    const visibility = data.replace('visibility_', '');
    const userState = getUserState(userId);
    
    if (userState.step !== 'visibility') {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'פג תוקף הבחירה',
            show_alert: false
        });
        return;
    }
    
    // שמירת המודעה עם ה-visibility שנבחר
    await savePost(chatId, userId, { ...userState, visibility });
    clearUserState(userId);
}

async function handlePricingSelection(chatId, userId, data) {
    const pricingMode = data.replace('pricing_', '');
    const userState = getUserState(userId);
    
    setUserState(userId, { ...userState, pricing_mode: pricingMode });
    
    if (pricingMode === 'payment' || pricingMode === 'both') {
        await bot.sendMessage(chatId, '💵 הקלידו את טווח המחיר (דוגמא: "100-500 ש״ח" או הקלידו "דלג"):');
        setUserState(userId, { ...userState, step: 'price_range', pricing_mode: pricingMode });
    } else if (pricingMode === 'free') {
        // For free posts, set price_range to "חינם" and skip price input
        await bot.sendMessage(chatId, '🔗 הוסיפו קישורים לתיק עבודות או דף נחיתה (או הקלידו "דלג"):');
        setUserState(userId, { ...userState, step: 'portfolio', pricing_mode: pricingMode, price_range: 'חינם' });
    } else {
        await bot.sendMessage(chatId, '🔗 הוסיפו קישורים לתיק עבודות או דף נחיתה (או הקלידו "דלג"):');
        setUserState(userId, { ...userState, step: 'portfolio', pricing_mode: pricingMode });
    }
    
    utils.logAction(userId, 'select_pricing', { mode: pricingMode });
}

async function handleBrowseSelection(chatId, data, messageId = null, page = 1) {
    const parts = data.split('_');
    let browseType = parts[1];
    
    // Handle pagination
    if (parts.length >= 4 && parts[2] === 'page') {
        page = parseInt(parts[3]);
        browseType = parts[1];
    }
    
    try {
        let filter = {};
        if (browseType !== 'all') {
            filter.pricingMode = browseType;
        }
        
        // Get all posts for this filter
        const allPosts = await db.getRecentPosts(100, filter); // Get more posts for pagination
        
        if (allPosts.length === 0) {
            const message = '📱 אין מודעות זמינות בקטגוריה זו כרגע.';
            if (messageId) {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...keyboards.getBrowseKeyboard()
                });
            } else {
                await bot.sendMessage(chatId, message, keyboards.getBrowseKeyboard());
            }
            return;
        }
        
        const categoryName = browseType === 'all' ? 'כל המודעות' :
                           browseType === 'barter' ? 'מודעות בארטר' : 
                           browseType === 'payment' ? 'מודעות בתשלום' :
                           browseType === 'free' ? 'מודעות חינם' : 'מודעות';
        
        // Pagination settings
        const postsPerPage = 8;
        const totalPages = Math.ceil(allPosts.length / postsPerPage);
        const startIndex = (page - 1) * postsPerPage;
        const endIndex = Math.min(startIndex + postsPerPage, allPosts.length);
        const currentPosts = allPosts.slice(startIndex, endIndex);
        
        // Build the message with numbered titles
        let message = `📱 *${categoryName}*\n`;
        message += `📄 עמוד ${page} מתוך ${totalPages}\n\n`;
        
        currentPosts.forEach((post, index) => {
            const number = startIndex + index + 1;
            const title = post.title.length > 40 ? post.title.substring(0, 37) + '...' : post.title;
            
            // Add emoji based on pricing mode
            let emoji = '';
            if (post.pricing_mode === 'free' || (post.pricing_mode === 'both' && post.price_range && post.price_range.includes('חינם'))) {
                emoji = config.bot.useEmojis ? '🆓 ' : '[חינם] ';
            } else if (post.pricing_mode === 'payment') {
                emoji = config.bot.useEmojis ? '💰 ' : '[תשלום] ';
            } else if (post.pricing_mode === 'barter') {
                emoji = config.bot.useEmojis ? '🤝 ' : '[בארטר] ';
            } else if (post.pricing_mode === 'both') {
                emoji = config.bot.useEmojis ? '💰🤝 ' : '[שניהם] ';
            }
            
            message += `${number}. ${emoji}${title}\n`;
        });
        
        message += '\n_לחצו על מספר כדי לראות את המודעה המלאה_';
        
        // Create inline keyboard with post numbers and navigation
        const keyboard = [];
        
        // Post selection buttons (2 rows of 4)
        for (let row = 0; row < 2; row++) {
            const rowButtons = [];
            for (let col = 0; col < 4; col++) {
                const index = row * 4 + col;
                if (index < currentPosts.length) {
                    const post = currentPosts[index];
                    const buttonNumber = startIndex + index + 1;
                    rowButtons.push({
                        text: `${buttonNumber}`,
                        callback_data: `view_post_${post.id}_from_browse_${browseType}_${page}`
                    });
                }
            }
            if (rowButtons.length > 0) {
                keyboard.push(rowButtons);
            }
        }
        
        // Navigation row
        const navRow = [];
        const e = config.bot.useEmojis;
        
        if (page > 1) {
            navRow.push({ text: e ? '◀️ הקודם' : '< הקודם', callback_data: `browse_${browseType}_page_${page - 1}` });
        }
        
        navRow.push({ text: `${page}/${totalPages}`, callback_data: 'noop' });
        
        if (page < totalPages) {
            navRow.push({ text: e ? 'הבא ▶️' : 'הבא >', callback_data: `browse_${browseType}_page_${page + 1}` });
        }
        
        keyboard.push(navRow);
        
        // Back to browse options
        keyboard.push([{ text: e ? '🔙 חזרה לאפשרויות דפדוף' : 'חזרה לאפשרויות דפדוף', callback_data: 'back_to_browse_options' }]);
        
        const replyMarkup = {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
        
        // Send or edit the message
        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...replyMarkup
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                ...replyMarkup
            });
        }
        
        utils.logAction(chatId, 'browse', { type: browseType, page, resultsCount: allPosts.length });
        
    } catch (error) {
        utils.logError(error, 'browse_selection');
        const errorMessage = config.messages.error;
        if (messageId) {
            await bot.editMessageText(errorMessage, {
                chat_id: chatId,
                message_id: messageId
            });
        } else {
            await bot.sendMessage(chatId, errorMessage);
        }
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
