const axios = require('axios');

const LOG_ENDPOINT = 'http://20.244.56.144/evaluation-service/logs';
const ACCESS_TOKEN = process.env.LOG_TOKEN || process.env.ACCESS_TOKEN || '';

async function Log(stack, level, pkg, message) {
  const validStacks = ['backend', 'frontend'];
  const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
  const validPackages = ['cache', 'controller', 'cron_job', 'db', 'domain', 'handler', 'repository', 'route'];

  if (!validStacks.includes(stack.toLowerCase())) {
    throw new Error(`Invalid stack: ${stack}`);
  }
  if (!validLevels.includes(level.toLowerCase())) {
    throw new Error(`Invalid level: ${level}`);
  }
  if (stack.toLowerCase() === 'backend' && !validPackages.includes(pkg.toLowerCase())) {
    throw new Error(`Invalid package for backend: ${pkg}`);
  }
  if (typeof message !== 'string' || message.trim() === '') {
    throw new Error('Message must be a non-empty string');
  }

  const payload = {
    stack: stack.toLowerCase(),
    level: level.toLowerCase(),
    package: pkg.toLowerCase(),
    message
  };

  try {
    if (!ACCESS_TOKEN) {
      throw new Error('Missing LOG_TOKEN/ACCESS_TOKEN env for logging');
    }
    const response = await axios.post(LOG_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });
    console.log(`Log created: ID=${response.data.logID}, Message="${response.data.message}"`);
    return response.data;
  } catch (error) {
    console.error('Logging failed:', error.response?.data || error.message);
  }
}

module.exports = { Log };
