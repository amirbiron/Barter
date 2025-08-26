'use strict';

const path = require('path');
const os = require('os');

// Ensure we use a temp DB when not provided (must be set BEFORE requiring database.js)
if (!process.env.DATABASE_PATH) {
    process.env.DATABASE_PATH = path.join(os.tmpdir(), 'barter_bot_smoke.db');
    console.log(`Using temp DATABASE_PATH: ${process.env.DATABASE_PATH}`);
}

const db = require('../database');

async function main() {
    try {
        // Ensure schema is created
        await db.init();

        const userId = 999999;
        const username = 'smoke_user';
        const firstName = 'Smoke';
        await db.upsertUser(userId, username, firstName);

        const postId = await db.createPost({
            userId,
            title: 'Smoke Test Post',
            description: 'This is a CI smoke test post',
            pricingMode: 'free',
            priceRange: null,
            portfolioLinks: null,
            contactInfo: '@smoke',
            tags: ['smoke', 'ci'],
            visibility: 'public',
        });

        const fetched = await db.getPost(postId);
        if (!fetched || fetched.id !== postId) {
            throw new Error('Failed to create/fetch post');
        }

        const results = await db.searchPostsByTitle('Smoke Test', {});
        if (!Array.isArray(results)) {
            throw new Error('searchPostsByTitle did not return an array');
        }

        const saveRes = await db.savePost(userId, postId);
        if (!saveRes || saveRes.saved !== true) {
            throw new Error('Failed to save post');
        }

        const isSaved = await db.isPostSaved(userId, postId);
        if (!isSaved) {
            throw new Error('isPostSaved returned false');
        }

        const savedCount = await db.countSavedPosts(userId);
        if (typeof savedCount !== 'number') {
            throw new Error('countSavedPosts did not return a number');
        }

        await db.unsavePost(userId, postId);

        await db.close();

        console.log('✅ Smoke test passed');
    } catch (err) {
        console.error('❌ Smoke test failed:', err);
        try {
            await db.close();
        } catch (e) { /* best-effort close */ }
        process.exit(1);
    }
}

main();
