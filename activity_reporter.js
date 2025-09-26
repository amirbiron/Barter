// Simple activity reporter that logs user activity to MongoDB
// Usage:
//   const { create_reporter } = require('./activity_reporter');
//   const reporter = create_reporter({ mongodb_uri, service_id, service_name });
//   reporter.report_activity(user_id);
//   await reporter.close(); // on shutdown

let MongoClient = null;
try {
  // Lazy require so the app can still run if dependency missing before install
  MongoClient = require('mongodb').MongoClient;
} catch (e) {
  MongoClient = null;
}

function create_reporter({ mongodb_uri, service_id, service_name }) {
  const state = {
    client: null,
    db: null,
    collection: null,
    ready: false,
    connecting: false,
    queue: [],
  };

  async function ensureConnection() {
    if (state.ready || state.connecting) return;
    if (!MongoClient) {
      console.warn('[activity_reporter] mongodb driver not installed. Skipping DB logging.');
      return;
    }
    try {
      state.connecting = true;
      state.client = new MongoClient(mongodb_uri, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
      });
      await state.client.connect();
      const dbName = 'activity_logs';
      state.db = state.client.db(dbName);
      state.collection = state.db.collection('events');
      state.ready = true;
      state.connecting = false;
      // Flush queue
      if (state.queue.length) {
        const toInsert = state.queue.splice(0, state.queue.length);
        try {
          await state.collection.insertMany(toInsert, { ordered: false });
        } catch (_) {}
      }
      console.log('[activity_reporter] Connected to MongoDB');
    } catch (err) {
      state.connecting = false;
      console.warn('[activity_reporter] MongoDB connection failed:', err.message);
    }
  }

  // Kick off connection attempt but don't block app startup
  ensureConnection();

  function report_activity(user_id) {
    const doc = {
      user_id: String(user_id),
      service_id,
      service_name,
      ts: new Date(),
      type: 'activity',
    };
    // Best-effort, non-blocking
    if (state.ready && state.collection) {
      state.collection.insertOne(doc).catch(() => {});
    } else {
      state.queue.push(doc);
      // Try reconnecting in background
      ensureConnection();
    }
  }

  async function close() {
    try {
      if (state.client) {
        await state.client.close();
      }
      state.ready = false;
    } catch (_) {}
  }

  return { report_activity, close };
}

module.exports = { create_reporter };
