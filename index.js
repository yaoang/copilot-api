// ─── 状态 ────────────────────────────────────────────────────────────────────
let fileContent = '';   // 已附加的文件文本内容
let attachedUrl = '';   // 已附加的网址
let isStreaming = false; // 是否正在接收流式响应
const history = [];     // 对话历史 [{role, content}]

// ─── DOM 引用 ─────────────────────────────────────────────────────────────────
const messagesEl     = document.getElementById('messages');
const userInput      = document.getElementById('user-input');
const btnSend        = document.getElementById('btn-send');
const btnLogin       = document.getElementById('btn-login');
const statusBadge    = document.getElementById('status-badge');
const fileInput      = document.getElementById('file-input');
const fileNameEl     = document.getElementById('file-name');
const urlDisplay     = document.getElementById('url-display');
const urlInputRow    = document.getElementById('url-input-row');
const urlText        = document.getElementById('url-text');
const btnUrlConfirm  = document.getElementById('btn-url-confirm');
const btnAttachFile  = document.getElementById('btn-attach-file');
const btnAttachUrl   = document.getElementById('btn-attach-url');
const btnClearAttach = document.getElementById('btn-clear-attach');
const exportArea     = document.getElementById('export-area');
const loginModal     = document.getElementById('login-modal');
const userCodeEl     = document.getElementById('user-code');
const verifyUrlEl    = document.getElementById('verify-url');
const btnCloseModal  = document.getElementById('btn-close-modal');

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 在消息列表末尾追加一条消息气泡，返回该元素 */
function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

/** 更新登录状态徽章 */
function setStatus(online) {
  statusBadge.textContent = online ? '已登录' : '未登录';
  statusBadge.className = online ? 'online' : '';
}

// ─── 登录状态检查 ─────────────────────────────────────────────────────────────

async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    setStatus(data.loggedIn);
  } catch (_) {
    setStatus(false);
  }
}

// 页面加载时检查一次
checkStatus();

// ─── 登录流程 ─────────────────────────────────────────────────────────────────

btnLogin.addEventListener('click', async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = '登录中…';
  try {
    const res = await fetch('/api/login');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // 显示 user_code 弹窗
    userCodeEl.textContent = data.user_code;
    verifyUrlEl.textContent = data.verification_uri;
    loginModal.classList.add('visible');

    // 每 5 秒轮询一次登录状态，最多等 3 分钟
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      await checkStatus();
      if (statusBadge.classList.contains('online') || tries > 36) {
        clearInterval(poll);
        loginModal.classList.remove('visible');
        if (statusBadge.classList.contains('online')) {
          appendMessage('system', '✅ 登录成功，可以开始对话了。');
        }
      }
    }, 5000);
  } catch (err) {
    appendMessage('system', `登录失败：${err.message}`);
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = '登录 Copilot';
  }
});

btnCloseModal.addEventListener('click', () => {
  loginModal.classList.remove('visible');
  checkStatus();
});

// ─── 文件附加 ─────────────────────────────────────────────────────────────────

btnAttachFile.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    fileContent = e.target.result;
    fileNameEl.textContent = `📄 ${file.name}`;
    btnClearAttach.style.display = 'inline-block';
  };
  reader.readAsText(file);
  // 重置 input，允许重复选同一文件
  fileInput.value = '';
});

// ─── 网址附加 ─────────────────────────────────────────────────────────────────

btnAttachUrl.addEventListener('click', () => {
  urlInputRow.classList.toggle('visible');
});

btnUrlConfirm.addEventListener('click', () => {
  const val = urlText.value.trim();
  if (!val) return;
  attachedUrl = val;
  urlDisplay.textContent = `🔗 ${val.length > 40 ? val.slice(0, 40) + '…' : val}`;
  urlInputRow.classList.remove('visible');
  urlText.value = '';
  btnClearAttach.style.display = 'inline-block';
});

// ─── 清除附件 ─────────────────────────────────────────────────────────────────

btnClearAttach.addEventListener('click', () => {
  fileContent = '';
  attachedUrl = '';
  fileNameEl.textContent = '';
  urlDisplay.textContent = '';
  btnClearAttach.style.display = 'none';
});

// ─── 自动调整输入框高度 ───────────────────────────────────────────────────────

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
});

// ─── 发送消息 ─────────────────────────────────────────────────────────────────

/** Enter 发送，Shift+Enter 换行 */
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

btnSend.addEventListener('click', sendMessage);

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // 显示用户消息
  appendMessage('user', text);
  history.push({ role: 'user', content: text });

  // 重置输入框
  userInput.value = '';
  userInput.style.height = 'auto';

  // 准备请求体
  const body = { messages: history };
  if (fileContent) body.fileContent = fileContent;
  if (attachedUrl) body.url = attachedUrl;

  // 清除一次性附件（文件和网址用完即清）
  fileContent = '';
  attachedUrl = '';
  fileNameEl.textContent = '';
  urlDisplay.textContent = '';
  btnClearAttach.style.display = 'none';

  // 创建助手消息气泡（流式填充）
  const assistantBubble = appendMessage('assistant', '');
  isStreaming = true;
  btnSend.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      assistantBubble.textContent = `错误：${err.error || res.statusText}`;
      return;
    }

    // 解析 SSE 流
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // 每行格式：data: {...} 或 data: [DONE]
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            assistantBubble.textContent = fullText;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } catch (_) { /* 忽略解析错误 */ }
      }
    }

    // 将完整回复加入历史
    history.push({ role: 'assistant', content: fullText });

    // 有回复后显示导出按钮
    exportArea.classList.add('visible');
  } catch (err) {
    assistantBubble.textContent = `请求失败：${err.message}`;
  } finally {
    isStreaming = false;
    btnSend.disabled = false;
  }
}

// ─── 导出功能 ─────────────────────────────────────────────────────────────────

/** 触发浏览器下载 */
function download(filename, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('btn-export-txt').addEventListener('click', () => {
  const lines = history.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
  download('copilot-chat.txt', lines);
});

document.getElementById('btn-export-md').addEventListener('click', () => {
  const lines = history.map(m => `**${m.role === 'user' ? '用户' : 'Copilot'}**\n\n${m.content}`).join('\n\n---\n\n');
  download('copilot-chat.md', lines);
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  // CSV：role, content（内容中的双引号转义）
  const rows = [['role', 'content']];
  history.forEach(m => rows.push([m.role, m.content.replace(/"/g, '""')]));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\r\n');
  download('copilot-chat.csv', csv);
});
