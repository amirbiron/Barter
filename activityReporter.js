const { MongoClient } = require('mongodb');

class ActivityReporter {
    constructor(mongodbUri, serviceId, serviceName) {
        this.serviceId = serviceId;
        this.serviceName = serviceName;
        this.connected = false;
        this.connect(mongodbUri);
    }
    
    async connect(mongodbUri) {
        try {
            this.client = new MongoClient(mongodbUri);
            await this.client.connect();
            this.db = this.client.db('render_bot_monitor');
            this.connected = true;
        } catch (err) {
            this.connected = false;
        }
    }
    
    async reportActivity(userId) {
        if (!this.connected) return;
        
        try {
            const now = new Date();
            
            await this.db.collection('user_interactions').updateOne(
                { service_id: this.serviceId, user_id: userId },
                {
                    $set: { last_interaction: now },
                    $inc: { interaction_count: 1 },
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
            
            await this.db.collection('service_activity').updateOne(
                { _id: this.serviceId },
                {
                    $set: {
                        last_user_activity: now,
                        service_name: this.serviceName,
                        updated_at: now
                    },
                    $setOnInsert: {
                        created_at: now,
                        status: 'active'
                    }
                },
                { upsert: true }
            );
        } catch (err) {
            // אל תפיל את הבוט
        }
    }
}

module.exports = ActivityReporter;

