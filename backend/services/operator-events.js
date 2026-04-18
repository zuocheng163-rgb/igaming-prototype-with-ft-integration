'use strict';
/**
 * Operator Event Bus
 *
 * In-process EventEmitter that broadcasts every RabbitMQ-published event
 * to connected operator SSE clients. Used by the AFA Real-time Monitor
 * in the operator portal without requiring AFA agent tokens.
 *
 * Events are keyed by brand: `brand:${brandId}`
 */
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(200); // support many simultaneous operator SSE connections

module.exports = bus;
