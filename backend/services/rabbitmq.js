const amqp = require('amqplib');
const { logger } = require('./logger');

class RabbitMQService {
    constructor() {
        this.amqpUrl = process.env.CLOUDAMQP_URL;
        this.defaultQueue = process.env.RABBITMQ_QUEUE || 'fasttrack-events';
    }

    /**
     * Publishes an event to RabbitMQ using the AMQP protocol.
     * This ensures the message is "further processed by Rabbit" (headers, properties, etc.)
     * and avoids the wrapping mess caused by the HTTP Management API.
     */
    async publishEvent(routingKey, payload, type = null, options = {}) {
        // 1. F13-AFA Loopback Hook: Process AFA events even if RabbitMQ is disabled/mocked
        // We use a late require to avoid circular dependency
        try {
            const { AfaWebhookService } = require('./afa-webhook-service');
            const supabaseService = require('./supabase');
            const afaWebhookService = new AfaWebhookService(supabaseService);
            
            // Extract event type for matching
            let eventType = type || (payload && payload.type) || routingKey || this.defaultQueue;
            
            // Map internal event types to AFA supported types
            if (eventType.includes('balance')) eventType = 'balance';
            else if (eventType.includes('bonus')) eventType = 'bonus';
            else if (eventType.includes('payment') || eventType.includes('deposit')) eventType = 'deposit';
            else if (eventType.includes('withdrawal')) eventType = 'withdrawal';
            
            // Extract brandId
            const brandId = (payload && (payload.brand_id || payload.brandId || payload.tenant_id)) || 1;
            
            logger.info(`[AFA Hook] Processing event for AFA stream (Loopback)`, { eventType, brandId });
            
            // We do NOT await this to avoid blocking the main flow
            afaWebhookService.processEvent(eventType, payload, brandId).catch(err => {
                logger.error('[AFA Hook] Event processing failed', { eventType, error: err.message });
            });
        } catch (hookErr) {
            logger.info('[AFA Hook] Failed to initialize hook', { error: hookErr.message });
        }

        // 2. Physical RabbitMQ Publishing
        if (!this.amqpUrl) {
            logger.warn('[RabbitMQ] CLOUDAMQP_URL not set. Skipping physical publish.');
            return false;
        }

        const targetRoutingKey = routingKey || this.defaultQueue;
        let connection = null;

        try {
            // Establish a new connection for serverless (Vercel)
            // In a long-running environment, we would use a persistent connection.
            connection = await amqp.connect(this.amqpUrl);
            const channel = await connection.createChannel();

            // Ensure the queue exists
            await channel.assertQueue(targetRoutingKey, {
                durable: true
            });

            const content = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));

            const properties = {
                contentType: 'application/json',
                deliveryMode: 2, // Persistent
                type: type || (payload && payload.type) || '',
                headers: options.headers || {}
            };

            const published = channel.sendToQueue(targetRoutingKey, content, properties);
            
            if (published) {
                logger.debug(`[RabbitMQ] Published to ${targetRoutingKey}`, { type: properties.type });

                const eventType = type || (properties.type) || targetRoutingKey;
                const brandId = (payload && (payload.brand_id || payload.brandId)) || 1;

                // Operator Monitor: fan out to in-process SSE bus for the AFA Real-time Monitor page
                try {
                    const operatorEvents = require('./operator-events');
                    operatorEvents.emit(`brand:${brandId}`, {
                        event_type: eventType,
                        data: payload,
                        brand_id: brandId,
                        occurred_at: new Date().toISOString(),
                    });
                } catch (busErr) {
                    logger.debug('[OperatorEvents] Bus emit failed', { error: busErr.message });
                }
            }

            // Close gracefully
            await channel.close();
            await connection.close();

            return true;
        } catch (error) {
            logger.error('[RabbitMQ] amqplib Publish Failed', {
                message: error.message,
                stack: error.stack
            });

            // Clean up connection if it was opened
            if (connection) {
                try { await connection.close(); } catch (e) { }
            }

            return false;
        }
    }
}

module.exports = new RabbitMQService();
