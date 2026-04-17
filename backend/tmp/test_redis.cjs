const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.ping((err, res) => {
  if (err) {
    console.error('Redis Ping Failed:', err.message);
    process.exit(1);
  } else {
    console.log('Redis Ping Success:', res);
    process.exit(0);
  }
});
