// metrics.js
const client = require('prom-client');

// Collect Node default metrics (CPU, memory...)
client.collectDefaultMetrics({ timeout: 5000 });

// Counter for total requests
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// Histogram for request durations (seconds)
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10]
});

module.exports = {
  client,
  httpRequestsTotal,
  httpRequestDuration
};
