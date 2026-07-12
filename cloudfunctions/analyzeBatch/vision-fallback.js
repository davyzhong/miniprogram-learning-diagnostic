// analyzeBatch/vision-fallback.js
// 方案 C 降级：当 CloudBase AI（方案 A）调用失败时，
// 通过外部视觉 API（智谱 GLM-4V）作为降级路径。
//
// API Key 通过云函数环境变量 FALLBACK_VISION_API_KEY 注入，不进代码。
// 如果未配置 Key，降级被跳过（返回 null），主路径错误照常抛出。
//
// 调用方式与 callAI 一致：返回 AI 文本（JSON 字符串）。

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 智谱 AI API 配置（OpenAI 兼容格式）
const FALLBACK_ENDPOINT = process.env.FALLBACK_VISION_ENDPOINT || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const FALLBACK_MODEL = process.env.FALLBACK_VISION_MODEL || 'glm-4v-plus';
const FALLBACK_TIMEOUT_MS = Number(process.env.FALLBACK_VISION_TIMEOUT_MS) || 50000;

function isFallbackConfigured() {
  return Boolean(process.env.FALLBACK_VISION_API_KEY);
}

/**
 * 用 HTTP POST 调用外部视觉 API。
 * 格式兼容 OpenAI chat completions：{ model, messages: [{ role, content: [text, image_url] }] }
 */
function postJSON(urlString, body, apiKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const transport = parsed.protocol === 'https:' ? https : http;

    const postData = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`降级 API 返回非 JSON（状态码 ${res.statusCode}）: ${data.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`降级 API 返回状态码 ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`降级 API 请求超时（${timeoutMs}ms）`));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * 降级调用外部视觉 API。
 *
 * @param {string[]} imageUrls - 图片临时 URL 数组
 * @param {string} prompt - 完整 prompt 文本
 * @returns {Promise<string>} AI 返回的文本（JSON 字符串）
 */
async function callFallbackVision(imageUrls, prompt) {
  if (!isFallbackConfigured()) {
    return null; // 未配置降级 Key，跳过
  }

  const apiKey = process.env.FALLBACK_VISION_API_KEY;
  console.log(`[fallback] 降级到外部视觉 API: ${FALLBACK_MODEL}，${imageUrls.length} 张图片`);

  const content = [
    { type: 'text', text: prompt },
    ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
  ];

  const body = {
    model: FALLBACK_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0.3,
    // 强制 JSON 输出（如果 API 支持）
    response_format: { type: 'json_object' },
  };

  const response = await postJSON(FALLBACK_ENDPOINT, body, apiKey, FALLBACK_TIMEOUT_MS);

  // OpenAI 兼容格式：choices[0].message.content
  const text = response &&
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content;

  if (!text || typeof text !== 'string') {
    throw new Error('降级 API 未返回有效文本: ' + JSON.stringify(response).slice(0, 200));
  }

  console.log(`[fallback] 降级成功，返回 ${text.length} 字符`);
  return text;
}

module.exports = {
  isFallbackConfigured,
  callFallbackVision,
};
