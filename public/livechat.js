/**
 * iFan.asia — Live Chat widget nhúng vào website chủ shop.
 *
 * Chủ shop chỉ dán 1 dòng:
 *   <script src="https://ifan-web.vercel.app/livechat.js"
 *           data-ifan-key="KHOA_NHUNG" async></script>
 *
 * Cách ly với website khách (yêu cầu cứng "không đụng độ CSS/JS của họ"):
 * - Toàn bộ giao diện nằm trong Shadow DOM mode 'closed' → CSS trang khách
 *   không lọt vào, CSS của widget không lọt ra; trang khách cũng không với tay
 *   vào DOM của widget được.
 * - Host element đặt `all: initial` để chặn các thuộc tính kế thừa (font,
 *   color, line-height...) rò qua ranh giới shadow.
 * - Không tạo biến toàn cục nào ngoài 1 cờ chống nạp trùng; không đụng
 *   prototype, không thêm listener lên window ngoài resize của chính widget.
 * - Nội dung tin luôn gán bằng textContent (không innerHTML) → không có đường
 *   chèn HTML/script từ dữ liệu.
 */
(function () {
  "use strict";

  if (window.__ifanLiveChat) return;
  window.__ifanLiveChat = true;

  var script = document.currentScript;
  if (!script) return;
  var KEY = script.getAttribute("data-ifan-key") || "";
  if (!/^[0-9a-f]{16,128}$/.test(KEY)) return;

  var API = new URL(script.src, location.href).origin;
  var STORE_KEY = "ifan_lc_" + KEY;
  var POLL_OPEN_MS = 3000;
  var POLL_IDLE_MS = 30000;
  var MAX_TEXT = 2000;

  // ---------- ngôn ngữ ----------
  var docLang = (
    script.getAttribute("data-ifan-lang") ||
    document.documentElement.getAttribute("lang") ||
    "vi"
  ).toLowerCase();
  var LANG = docLang.indexOf("en") === 0 ? "en" : "vi";
  var T = {
    vi: {
      launcher: "Chat với shop",
      title: "Nhắn tin cho shop",
      close: "Đóng khung chat",
      placeholder: "Nhập tin nhắn của bạn…",
      send: "Gửi",
      sending: "Đang gửi…",
      you: "Bạn",
      shop: "Shop",
      errSend: "Chưa gửi được. Bạn thử lại giúp shop nhé.",
      errTooLong: "Tin dài quá, bạn rút ngắn lại giúp nhé.",
      errRate: "Bạn nhắn hơi nhanh. Chờ một chút rồi gửi tiếp nhé.",
      empty: "Shop đang trực. Bạn cứ nhắn, shop trả lời ngay.",
      counter: "{n} ký tự còn lại",
    },
    en: {
      launcher: "Chat with us",
      title: "Message the shop",
      close: "Close chat window",
      placeholder: "Type your message…",
      send: "Send",
      sending: "Sending…",
      you: "You",
      shop: "Shop",
      errSend: "Could not send. Please try again.",
      errTooLong: "That message is too long — please shorten it.",
      errRate: "You are sending too fast. Please wait a moment.",
      empty: "We are online. Send a message and we will reply shortly.",
      counter: "{n} characters left",
    },
  }[LANG];

  // ---------- trạng thái ----------
  var token = null;
  try {
    token = localStorage.getItem(STORE_KEY);
  } catch {
    token = null; // Safari private mode / cookie bị chặn — vẫn chat được, mất phiên khi tải lại
  }
  if (token && !/^[0-9a-f]{64}$/.test(token)) token = null;

  var open = false;
  var lastAt = null;
  var seenIds = Object.create(null);
  var unread = 0;
  var timer = null;
  var sending = false;

  // ---------- dựng khung ----------
  var host = document.createElement("div");
  host.setAttribute("data-ifan-livechat", "");
  host.style.cssText =
    "all:initial!important;position:fixed!important;inset:0!important;" +
    "z-index:2147483000!important;pointer-events:none!important;display:block!important;";
  var root = host.attachShadow({ mode: "closed" });

  root.innerHTML =
    "<style>" +
    ":host,*{box-sizing:border-box}" +
    ".wrap{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;" +
    "align-items:flex-end;gap:12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto," +
    "'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.45;color:#1c1917;" +
    "-webkit-font-smoothing:antialiased}" +
    ".panel{pointer-events:auto;width:360px;max-width:calc(100vw - 32px);height:520px;" +
    "max-height:calc(100vh - 112px);background:#fff;border:1px solid #e7e5e4;border-radius:14px;" +
    "box-shadow:0 18px 48px rgba(28,25,23,.18);display:none;flex-direction:column;overflow:hidden}" +
    ".panel.on{display:flex}" +
    ".head{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;" +
    "background:#cc4c18;color:#fff}" +
    ".head b{flex:1;min-width:0;font-size:14px;font-weight:600;overflow:hidden;" +
    "text-overflow:ellipsis;white-space:nowrap}" +
    ".x{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:rgba(255,255,255,.16);" +
    "color:#fff;font-size:17px;line-height:1;cursor:pointer}" +
    ".x:hover{background:rgba(255,255,255,.3)}" +
    ".x:focus-visible,.send:focus-visible,.launch:focus-visible{outline:2px solid #1c1917;outline-offset:2px}" +
    ".body{flex:1;min-height:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;" +
    "background:#fafaf9}" +
    ".hint{margin:0;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #eeecea;" +
    "color:#57534e;font-size:13px}" +
    ".msg{max-width:82%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word;" +
    "overflow-wrap:anywhere}" +
    ".msg.in{align-self:flex-end;background:#cc4c18;color:#fff;border-bottom-right-radius:4px}" +
    ".msg.out{align-self:flex-start;background:#fff;border:1px solid #eeecea;border-bottom-left-radius:4px}" +
    ".foot{flex:none;border-top:1px solid #efedec;background:#fff;padding:10px}" +
    ".row{display:flex;gap:8px;align-items:flex-end}" +
    "textarea{flex:1;min-width:0;resize:none;height:40px;max-height:96px;padding:9px 12px;" +
    "border:1px solid #d6d3d1;border-radius:10px;font:inherit;color:inherit;background:#fff}" +
    "textarea:focus{outline:2px solid #cc4c18;outline-offset:-1px;border-color:#cc4c18}" +
    ".send{flex:none;height:40px;padding:0 16px;border:0;border-radius:10px;background:#cc4c18;" +
    "color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
    ".send:hover{background:#b0400f}" +
    ".send[disabled]{opacity:.55;cursor:default}" +
    ".note{margin:6px 2px 0;min-height:16px;font-size:12px;color:#78716c}" +
    ".note.bad{color:#b91c1c}" +
    ".launch{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;height:48px;" +
    "padding:0 18px;border:0;border-radius:999px;background:#cc4c18;color:#fff;font:inherit;" +
    "font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(204,76,24,.34);position:relative}" +
    ".launch:hover{background:#b0400f}" +
    ".launch svg{flex:none}" +
    ".dot{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;" +
    "border-radius:999px;background:#1c1917;color:#fff;font-size:11px;font-weight:700;" +
    "display:none;align-items:center;justify-content:center}" +
    ".dot.on{display:flex}" +
    // Điện thoại: nút bong bóng vẫn là viên thuốc nhỏ nép góc phải (KHÔNG kéo
    // ngang cả màn — nó nằm trên website của chủ shop, không được che nội dung
    // của họ). Khi mở khung chat thì ẩn nút đi để khung dùng trọn chiều cao;
    // đóng lại bằng nút X trên đầu khung.
    "@media (max-width:480px){" +
    ".wrap{right:12px;bottom:12px;left:12px;align-items:flex-end}" +
    ".panel{width:100%;max-width:none;height:calc(100vh - 24px);" +
    "height:calc(100dvh - 24px);max-height:none}" +
    ".wrap.open .launch{display:none}}" +
    "</style>" +
    '<div class="wrap">' +
    '<section class="panel" role="dialog" aria-modal="false">' +
    '<div class="head"><b></b>' +
    '<button class="x" type="button"><span aria-hidden="true">&#10005;</span></button></div>' +
    '<div class="body" role="log" aria-live="polite"></div>' +
    '<div class="foot"><div class="row">' +
    "<textarea rows=\"1\" maxlength=\"" + MAX_TEXT + '"></textarea>' +
    '<button class="send" type="button"></button>' +
    '</div><p class="note"></p></div>' +
    "</section>" +
    '<button class="launch" type="button">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-4.8A8.4 8.4 0 0 1 4 11.5 ' +
    '8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>' +
    "<span></span><span class=\"dot\"></span></button>" +
    "</div>";

  var $ = function (sel) {
    return root.querySelector(sel);
  };
  var wrap = $(".wrap");
  var panel = $(".panel");
  var body = $(".body");
  var input = $("textarea");
  var sendBtn = $(".send");
  var launchBtn = $(".launch");
  var closeBtn = $(".x");
  var note = $(".note");
  var dot = $(".dot");

  $(".head b").textContent = T.title;
  launchBtn.querySelector("span").textContent = T.launcher;
  launchBtn.setAttribute("aria-label", T.launcher);
  closeBtn.setAttribute("aria-label", T.close);
  closeBtn.setAttribute("title", T.close);
  input.setAttribute("placeholder", T.placeholder);
  input.setAttribute("aria-label", T.placeholder);
  sendBtn.textContent = T.send;

  // ---------- tiện ích ----------
  function post(path, payload) {
    return fetch(API + "/api/livechat/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      cache: "no-store",
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (json) {
          return { ok: res.ok, status: res.status, data: json };
        });
    });
  }

  function say(text, bad) {
    note.textContent = text || "";
    note.className = bad ? "note bad" : "note";
  }

  function addBubble(msg) {
    if (seenIds[msg.id]) return false;
    seenIds[msg.id] = true;
    var el = document.createElement("div");
    // direction 'in' = khách gửi lên (hiển thị bên phải), 'out' = shop trả lời
    el.className = "msg " + (msg.direction === "in" ? "in" : "out");
    el.textContent = msg.content == null ? "" : String(msg.content);
    el.setAttribute("aria-label", (msg.direction === "in" ? T.you : T.shop) + ": " + el.textContent);
    body.appendChild(el);
    if (msg.sent_at && (!lastAt || msg.sent_at > lastAt)) lastAt = msg.sent_at;
    return true;
  }

  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }

  function setUnread(n) {
    unread = n;
    dot.textContent = n > 9 ? "9+" : String(n);
    dot.className = n > 0 && !open ? "dot on" : "dot";
  }

  function absorb(list, countUnread) {
    var added = 0;
    for (var i = 0; i < (list || []).length; i++) {
      var m = list[i];
      if (addBubble(m)) {
        added++;
        if (countUnread && m.direction !== "in") setUnread(unread + 1);
      }
    }
    if (added) scrollDown();
    return added;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    if (!token) return; // chưa có phiên thì không có gì để hỏi
    timer = setTimeout(poll, open ? POLL_OPEN_MS : POLL_IDLE_MS);
  }

  function poll() {
    if (!token) return;
    post("poll", { key: KEY, token: token, after: lastAt }).then(
      function (r) {
        if (r.ok && r.data) absorb(r.data.messages, !open);
        schedule();
      },
      function () {
        schedule(); // mất mạng tạm thời — thử lại nhịp sau
      },
    );
  }

  function errorText(status, code) {
    if (status === 413 || code === "too_long") return T.errTooLong;
    if (status === 429 || code === "rate_limited") return T.errRate;
    return T.errSend;
  }

  function send() {
    if (sending) return;
    var text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_TEXT) {
      say(T.errTooLong, true);
      return;
    }
    sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = T.sending;
    say("");

    post("message", { key: KEY, token: token, text: text, url: location.href }).then(
      function (r) {
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = T.send;
        if (!r.ok) {
          say(errorText(r.status, r.data && r.data.error), true);
          return;
        }
        if (r.data.token) {
          token = r.data.token;
          try {
            localStorage.setItem(STORE_KEY, token);
          } catch {
            /* không lưu được thì phiên chỉ sống trong tab hiện tại */
          }
        }
        input.value = "";
        autoGrow();
        absorb([
          {
            id: r.data.messageId,
            direction: "in",
            content: text,
            sent_at: r.data.sentAt,
          },
        ]);
        schedule();
      },
      function () {
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = T.send;
        say(T.errSend, true);
      },
    );
  }

  function autoGrow() {
    input.style.height = "40px";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  }

  function toggle(next) {
    open = next;
    panel.className = open ? "panel on" : "panel";
    wrap.className = open ? "wrap open" : "wrap";
    launchBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      setUnread(0);
      scrollDown();
      input.focus();
    }
    schedule();
  }

  // ---------- sự kiện ----------
  launchBtn.addEventListener("click", function () {
    toggle(!open);
  });
  closeBtn.addEventListener("click", function () {
    toggle(false);
    launchBtn.focus();
  });
  sendBtn.addEventListener("click", send);
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      toggle(false);
      launchBtn.focus();
    }
  });

  // ---------- khởi động ----------
  // Chỉ gắn widget vào trang khi máy chủ xác nhận khóa nhúng + tên miền hợp lệ.
  // Khóa sai / tên miền chưa khai / widget đang tắt → không hiện gì cả.
  post("session", { key: KEY, token: token }).then(
    function (r) {
      if (!r.ok || !r.data) return;
      launchBtn.setAttribute("aria-expanded", "false");
      var greeting = (r.data.greeting || "").trim();
      var hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = greeting || T.empty;
      body.appendChild(hint);
      absorb(r.data.messages, false);
      if (!r.data.known) {
        token = null;
        try {
          localStorage.removeItem(STORE_KEY);
        } catch {
          /* bỏ qua */
        }
      }
      (document.body || document.documentElement).appendChild(host);
      scrollDown();
      schedule();
    },
    function () {
      /* không gọi được máy chủ → không hiện widget, trang khách không bị ảnh hưởng */
    },
  );
})();
