// Preloaded only by run-recruiters.mjs. Never loaded by the production entrypoint.
const net = require('node:net');
if (process.env.LOCAL_ONLY !== 'true') throw new Error('Local network policy requires LOCAL_ONLY');
const allowed = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const providerHosts = new Set(['api.openai.com', 'api.anthropic.com', 'chatgpt.com', 'auth.openai.com', 'auth.x.ai', 'accounts.x.ai', 'cli-chat-proxy.grok.com']);
if (process.env.RECRUITERS_DEVICE_ONLY !== 'true' && process.env.LOCAL_INFERENCE_MODE === 'real') {
  for (const host of ['api.openai.com', 'api.anthropic.com', 'chatgpt.com', 'auth.openai.com']) allowed.add(host);
}
if (process.env.CAREER_CLICKHOUSE_URL) {
  const url = new URL(process.env.CAREER_CLICKHOUSE_URL);
  const host = url.hostname.toLowerCase();
  if (process.env.RECRUITERS_DEVICE_ONLY !== 'true' || !providerHosts.has(host))
    allowed.add(host);
}
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  const options = Array.isArray(first) ? first[0] : first;
  if (options && typeof options === 'object' && typeof options.path === 'string')
    return original.apply(this, args);
  if (typeof options === 'string' && !/^\d+$/.test(options))
    return original.apply(this, args); // Local Unix-domain socket.
  const host = options && typeof options === 'object'
    ? options.host ?? options.hostname ?? 'localhost'
    : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (typeof host !== 'string' || !allowed.has(host.toLowerCase()))
    throw new Error('External socket destination is not allowed by the local network policy');
  return original.apply(this, args);
};
