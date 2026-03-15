import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Token 持久化路径
const TOKEN_FILE = path.join(__dirname, '.copilot_token.json');

// GitHub Copilot OAuth 配置
const CLIENT_ID = 'Iv1.b507a08c87ecfe98'; // GitHub Copilot VSCode client_id
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_URL = 'https://api.githubcopilot.com/chat/completions';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ─── Token 读写 ───────────────────────────────────────────────────────────────

/** 从磁盘读取已保存的 token 信息 */
function loadTokens() {
  // try {
  //   if (fs.existsSync(TOKEN_FILE)) {
  //     return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
  //   }
  // } catch (_) {}
  // return null;
  return tokens_value;
}

let tokens_value = null;

/** 将 token 信息持久化到磁盘 */
function saveTokens(data) {
  // fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  tokens_value = data
}

// ─── GitHub Device Flow 登录 ──────────────────────────────────────────────────

/**
 * 第一步：向 GitHub 申请 device_code，并在浏览器中打开验证页面
 * 返回 { device_code, user_code, verification_uri, interval, expires_in }
 */
async function requestDeviceCode() {
  const body = JSON.stringify({ client_id: CLIENT_ID, scope: 'read:user' })
  console.log('reqest body = ', body);
  const requestParams = {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body,
  };

  console.log('DEVICE_CODE_URL=', DEVICE_CODE_URL, 
    'request params = ', JSON.stringify(requestParams))
  const res = await fetch(DEVICE_CODE_URL, requestParams);
  console.log(`'got response from ${DEVICE_CODE_URL}`)
  return res.json();
}

/**
 * 第二步：轮询 GitHub，等待用户在浏览器中完成授权
 * 成功后返回 GitHub access_token
 */
async function pollForAccessToken(deviceCode, interval) {
  return new Promise((resolve, reject) => {
    // 使用递归 setTimeout 代替 setInterval，以便动态调整间隔
    // GitHub 返回 slow_down 时会要求增加 interval，setInterval 无法动态修改
    let currentInterval = (interval || 5) * 1000;

    async function poll() {
      try {
        console.log(`going to post TOKEN_URL, interval=${currentInterval}ms`);
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });
        const data = await res.json();
        console.log(`post token_url data=${JSON.stringify(data)}`);

        if (data.access_token) {
          console.log('get token successfully');
          resolve(data.access_token);
          return; // 不再调度下一次
        } else if (data.error === 'access_denied') {
          reject(new Error('用户拒绝授权'));
          return;
        } else if (data.error === 'slow_down') {
          // GitHub 要求放慢速度，使用响应中的 interval（秒）并加 1s 缓冲
          currentInterval = ((data.interval || 10) + 1) * 1000;
          console.log(`slow_down received, new interval=${currentInterval}ms`);
        }
        // authorization_pending 或 slow_down：等待后继续轮询
        setTimeout(poll, currentInterval);
      } catch (err) {
        reject(err);
      }
    }

    setTimeout(poll, currentInterval);
  });
}

/**
 * 第三步：用 GitHub access_token 换取 Copilot API token
 */
async function fetchCopilotToken(githubToken) {
  const res = await fetch(COPILOT_TOKEN_URL, {
    headers: {
      Authorization: `token ${githubToken}`,
      'Editor-Version': 'vscode/1.85.0',
      'Editor-Plugin-Version': 'copilot/1.138.0',
      'User-Agent': 'GithubCopilot/1.138.0',
    },
  });
  if (!res.ok) throw new Error(`获取 Copilot token 失败: ${res.status}`);
  return res.json(); // { token, expires_at, ... }
}

// ─── API 路由 ─────────────────────────────────────────────────────────────────

/**
 * GET /api/login
 * 启动 GitHub Device Flow 登录流程，返回用户需要输入的 user_code 和验证链接
 */
app.get('/api/login', async (req, res) => {
  try {
    console.log('going to request device code...')
    const deviceData = await requestDeviceCode();
    console.log('Got device data = ', JSON.stringify(deviceData));
    console.log('going to open verification uri')
    // 自动在浏览器中打开验证页面
    await open(deviceData.verification_uri);

    console.log('going to poll for access token')
    // 后台异步轮询，等待用户完成授权
    pollForAccessToken(deviceData.device_code, deviceData.interval)
      .then(async (githubToken) => {
        console.log('pull for access token successfully, githubToken=', JSON.stringify(githubToken))
        const copilotData = await fetchCopilotToken(githubToken);
        console.log('Login successfully ，going to save token, copilotData=', JSON.stringify(copilotData));
        saveTokens({ githubToken, copilotToken: copilotData.token, expiresAt: copilotData.expires_at });
      })
      .catch((err) => console.error('Login failed:', err.message));

    res.json({
      user_code: deviceData.user_code,
      verification_uri: deviceData.verification_uri,
      message: '请在浏览器中输入上方 user_code 完成授权',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/status
 * 检查当前登录状态，返回 token 是否有效
 */
app.get('/api/status', (req, res) => {
  const tokens = loadTokens();
  if (!tokens) return res.json({ loggedIn: false });
  const expired = tokens.expiresAt && Date.now() / 1000 > tokens.expiresAt;
  res.json({ loggedIn: !expired, expiresAt: tokens.expiresAt });
});

/**
 * POST /api/chat
 * 调用 Copilot Chat API
 * Body: { messages: [{role, content}], fileContent?: string, url?: string }
 */
app.post('/api/chat', async (req, res) => {
  try {
    let tokens = loadTokens();
    if (!tokens) return res.status(401).json({ error: '未登录，请先调用 /api/login' });

    // 如果 Copilot token 过期，自动刷新
    if (tokens.expiresAt && Date.now() / 1000 > tokens.expiresAt) {
      const copilotData = await fetchCopilotToken(tokens.githubToken);
      tokens.copilotToken = copilotData.token;
      tokens.expiresAt = copilotData.expires_at;
      saveTokens(tokens);
    }

    const { messages, fileContent, url } = req.body;

    // 如果传入了 URL，先抓取网页内容并注入到系统消息
    let systemContent = '';
    if (url) {
      try {
        const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await pageRes.text();
        // 简单去除 HTML 标签，保留文本
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        systemContent += `\n\n以下是来自 ${url} 的网页内容：\n${text}`;
      } catch (e) {
        systemContent += `\n\n（无法抓取 ${url}：${e.message}）`;
      }
    }

    // 如果传入了文件内容，注入到系统消息
    if (fileContent) {
      systemContent += `\n\n以下是用户上传的文件内容：\n${fileContent}`;
    }

    const finalMessages = systemContent
      ? [{ role: 'system', content: systemContent.trim() }, ...messages]
      : messages;

    // 调用 Copilot Chat API（流式）
    const copilotRes = await fetch(COPILOT_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.copilotToken}`,
        'Content-Type': 'application/json',
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.12.0',
        'Copilot-Integration-Id': 'vscode-chat',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: finalMessages,
        stream: true,
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!copilotRes.ok) {
      const errText = await copilotRes.text();
      return res.status(copilotRes.status).json({ error: errText });
    }

    // 将流式响应透传给前端（SSE 格式）
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    copilotRes.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 启动服务 ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 服务已启动: http://localhost:${PORT}`);
  console.log(`   访问上方地址打开聊天界面`);
  console.log(`   首次使用请点击页面中的"登录 Copilot"按钮`);
});
