// Ordered, case-insensitive patterns shared by the list and activity reports.
// Claims only: a user-agent string does not establish identity or crawl permission.
export const USER_AGENT_RULES = [
  {
    pattern: "Googlebot-Image",
    name: "Googlebot-Image",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 0,
  },
  {
    pattern: "Googlebot",
    name: "Googlebot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 1,
  },
  {
    pattern: "AdsBot-Google",
    name: "AdsBot-Google",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 2,
  },
  {
    pattern: "GoogleOther",
    name: "GoogleOther",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 3,
  },
  {
    pattern: "bingbot",
    name: "bingbot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 4,
  },
  {
    pattern: "BingPreview",
    name: "BingPreview",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 5,
  },
  {
    pattern: "AhrefsBot",
    name: "AhrefsBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 6,
  },
  {
    pattern: "SemrushBot",
    name: "SemrushBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 7,
  },
  {
    pattern: "DotBot",
    name: "DotBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 8,
  },
  {
    pattern: "GPTBot",
    name: "GPTBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 9,
  },
  {
    pattern: "OAI-SearchBot",
    name: "OAI-SearchBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 10,
  },
  {
    pattern: "ClaudeBot",
    name: "ClaudeBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 11,
  },
  {
    pattern: "Claude-SearchBot",
    name: "Claude-SearchBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 12,
  },
  {
    pattern: "PerplexityBot",
    name: "PerplexityBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 13,
  },
  {
    pattern: "Bytespider",
    name: "Bytespider",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 14,
  },
  {
    pattern: "PetalBot",
    name: "PetalBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 15,
  },
  {
    pattern: "YandexBot",
    name: "YandexBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 16,
  },
  {
    pattern: "Baiduspider",
    name: "Baiduspider",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 17,
  },
  {
    pattern: "Amazonbot",
    name: "Amazonbot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 18,
  },
  {
    pattern: "Applebot",
    name: "Applebot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 19,
  },
  {
    pattern: "meta-externalagent",
    name: "meta-externalagent",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 20,
  },
  {
    pattern: "CCBot",
    name: "CCBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 21,
  },
  {
    pattern: "MJ12bot",
    name: "MJ12bot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 22,
  },
  {
    pattern: "BLEXBot",
    name: "BLEXBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 23,
  },
  {
    pattern: "DataForSeoBot",
    name: "DataForSeoBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 24,
  },
  {
    pattern: "DuckDuckBot",
    name: "DuckDuckBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 25,
  },
  {
    pattern: "SeznamBot",
    name: "SeznamBot",
    traffic: "crawler",
    reason: "Named crawler token in user agent",
    priority: 26,
  },
  {
    pattern: "ChatGPT-User",
    name: "ChatGPT-User",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 27,
  },
  {
    pattern: "Claude-User",
    name: "Claude-User",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 28,
  },
  {
    pattern: "Perplexity-User",
    name: "Perplexity-User",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 29,
  },
  {
    pattern: "facebookexternalhit",
    name: "facebookexternalhit",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 30,
  },
  {
    pattern: "Twitterbot",
    name: "Twitterbot",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 31,
  },
  {
    pattern: "LinkedInBot",
    name: "LinkedInBot",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 32,
  },
  {
    pattern: "Slackbot",
    name: "Slackbot",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 33,
  },
  {
    pattern: "Discordbot",
    name: "Discordbot",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 34,
  },
  {
    pattern: "TelegramBot",
    name: "TelegramBot",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 35,
  },
  {
    pattern: "WhatsApp",
    name: "WhatsApp",
    traffic: "automation",
    reason:
      "Automated fetch or link-preview token; may be triggered by a person",
    priority: 36,
  },
  {
    pattern: "JobStash-.*(test|verification)",
    name: "JobStash test claim",
    traffic: "automation",
    reason: "User agent claims to be a JobStash test; not proof of permission",
    priority: 37,
  },
  {
    pattern: "HeadlessChrome",
    name: "HeadlessChrome",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 38,
  },
  {
    pattern: "Playwright",
    name: "Playwright",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 39,
  },
  {
    pattern: "Puppeteer",
    name: "Puppeteer",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 40,
  },
  {
    pattern: "Selenium",
    name: "Selenium",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 41,
  },
  {
    pattern: "PhantomJS",
    name: "PhantomJS",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 42,
  },
  {
    pattern: "curl",
    name: "curl",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 43,
  },
  {
    pattern: "Wget",
    name: "Wget",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 44,
  },
  {
    pattern: "python-requests",
    name: "python-requests",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 45,
  },
  {
    pattern: "python-httpx",
    name: "python-httpx",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 46,
  },
  {
    pattern: "Python-urllib",
    name: "Python-urllib",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 47,
  },
  {
    pattern: "Go-http-client",
    name: "Go-http-client",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 48,
  },
  {
    pattern: "node-fetch",
    name: "node-fetch",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 49,
  },
  {
    pattern: "axios",
    name: "axios",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 50,
  },
  {
    pattern: "undici",
    name: "undici",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 51,
  },
  {
    pattern: "okhttp",
    name: "okhttp",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 52,
  },
  {
    pattern: "Scrapy",
    name: "Scrapy",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 53,
  },
  {
    pattern: "aiohttp",
    name: "aiohttp",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 54,
  },
  {
    pattern: "Nmap",
    name: "Nmap",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 55,
  },
  {
    pattern: "sqlmap",
    name: "sqlmap",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 56,
  },
  {
    pattern: "Nikto",
    name: "Nikto",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 57,
  },
  {
    pattern: "zgrab",
    name: "zgrab",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 58,
  },
  {
    pattern: "UptimeRobot",
    name: "UptimeRobot",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 59,
  },
  {
    pattern: "Pingdom",
    name: "Pingdom",
    traffic: "automation",
    reason:
      "Automation, HTTP client, monitoring or scanner token in user agent",
    priority: 60,
  },
  {
    pattern: "bot|spider|crawler|slurp|scraper",
    name: "Other crawler",
    traffic: "crawler",
    reason: "Generic bot, crawler or scraper token in user agent",
    priority: 61,
  },
  {
    pattern: "Mozilla/5[.]0.*(Edg/|EdgA/|EdgiOS/)",
    name: "Edge",
    traffic: "likely_human",
    reason:
      "Recognized browser pattern without a matched automation token; a bot can imitate this",
    priority: 62,
  },
  {
    pattern: "Mozilla/5[.]0.*(OPR/|Opera/)",
    name: "Opera",
    traffic: "likely_human",
    reason:
      "Recognized browser pattern without a matched automation token; a bot can imitate this",
    priority: 63,
  },
  {
    pattern: "Mozilla/5[.]0.*(Firefox/|FxiOS/)",
    name: "Firefox",
    traffic: "likely_human",
    reason:
      "Recognized browser pattern without a matched automation token; a bot can imitate this",
    priority: 64,
  },
  {
    pattern: "Mozilla/5[.]0.*(Chrome/|CriOS/)",
    name: "Chrome",
    traffic: "likely_human",
    reason:
      "Recognized browser pattern without a matched automation token; a bot can imitate this",
    priority: 65,
  },
  {
    pattern: "Mozilla/5[.]0.*Version/.*Safari/",
    name: "Safari",
    traffic: "likely_human",
    reason:
      "Recognized browser pattern without a matched automation token; a bot can imitate this",
    priority: 66,
  },
];
export const userAgentMatchSql = (
  expression: string,
  parameter: string,
): string => `
 SELECT COALESCE(match.traffic,'unknown') AS traffic,
 COALESCE(match.name,'Unrecognized') AS agent,
 COALESCE(match.reason,CASE WHEN COALESCE(${expression},'')='' THEN 'No user agent supplied' ELSE 'No recognized browser or automation pattern' END) AS "agentReason"
 FROM (SELECT 1) seed LEFT JOIN LATERAL (
  SELECT * FROM jsonb_to_recordset(${parameter}::jsonb) AS r(pattern text,name text,traffic text,reason text,priority int)
  WHERE COALESCE(${expression},'') ~* r.pattern ORDER BY r.priority LIMIT 1
 ) match ON true`;
