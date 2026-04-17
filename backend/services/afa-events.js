const EventEmitter = require('events');
const events = new EventEmitter();

// Set max listeners to avoid warnings for multiple SSE connections
events.setMaxListeners(100);

module.exports = events;
