// Minimal activity reporter for Node.js to mirror the Python API
// Exposes: create_reporter({ mongodb_uri, service_id, service_name })

let cachedMongoClient = null;

async function getMongoClient(mongodbUri) {
    if (cachedMongoClient) {return cachedMongoClient;}
    // Lazy require to avoid hard dependency if not used
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongodbUri, {
        serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    cachedMongoClient = client;
    return client;
}

function create_reporter({ mongodb_uri, service_id, service_name }) {
    if (!mongodb_uri) {
        throw new Error('mongodb_uri is required');
    }

    const parsed = new URL(mongodb_uri);
    const dbNameFromUri = (parsed.pathname && parsed.pathname !== '/')
        ? parsed.pathname.replace('/', '')
        : 'activity_logs';

    let collectionPromise = null;

    async function getCollection() {
        if (collectionPromise) {return collectionPromise;}
        collectionPromise = (async () => {
            const client = await getMongoClient(mongodb_uri);
            const db = client.db(dbNameFromUri);
            const col = db.collection('activities');
            await col.createIndex({ userId: 1, ts: -1 });
            await col.createIndex({ ts: -1 });
            await col.createIndex({ serviceId: 1, ts: -1 });
            return col;
        })();
        return collectionPromise;
    }

    return {
        async report_activity(userId, extra = {}) {
            try {
                const col = await getCollection();
                const doc = {
                    userId,
                    serviceId: service_id || null,
                    serviceName: service_name || null,
                    ts: new Date(),
                    ...extra,
                };
                await col.insertOne(doc);
            } catch (err) {
                // Swallow errors to avoid impacting bot runtime
                // eslint-disable-next-line no-console
                console.error('[activity_reporter] Failed to report activity:', err.message);
            }
        },
    };
}

module.exports = { create_reporter };

