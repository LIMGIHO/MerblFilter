// ==UserScript==
// @name         네이버 읽음처리 PoC
// @namespace    merblfilter.poc
// @version      0.1.0
// @description  GM_xmlhttpRequest로 다른 출처에서 네이버 게시글 읽음처리가 되는지 검증하는 PoC
// @match        https://example.com/*
// @connect      www.naver.com
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const READ_URL =
    'https://www.naver.com/my/blog/BuddyNewPostReadNaverMainAsync.nhn';

  // 검증용 기본값 — 본인 네이버 ID / 글쓴이 블로그 ID
  const DEFAULT_BLOG_ID = 'lasid84'; // 로그인한 독자(나)
  const DEFAULT_PUBLISHER = 'ranto28'; // 글쓴이(메르)

  /**
   * 네이버 읽음처리 POST 발사
   * @param {string} blogId       로그인한 독자의 네이버 ID
   * @param {string} publisherId  글쓴이 블로그 ID
   * @param {string} logNo        게시글 번호
   * @param {(err: any, res: any) => void} cb
   */
  function markRead(blogId, publisherId, logNo, cb) {
    const body =
      `blogId=${encodeURIComponent(blogId)}` +
      `&logNo=${encodeURIComponent(logNo)}` +
      `&serviceLogTypeValue=0&readYn=true` +
      `&publisherId=${encodeURIComponent(publisherId)}`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: READ_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: body,
      onload: (res) => cb(null, res),
      onerror: (err) => cb(err, null),
    });
  }

  /* ── 플로팅 테스트 패널 ─────────────────────────────── */
  function buildPanel() {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'width:300px',
      'padding:14px',
      'background:#1b1b1f',
      'color:#e8e8ea',
      'font:13px/1.5 -apple-system,system-ui,sans-serif',
      'border:1px solid #3a3a40',
      'border-radius:10px',
      'box-shadow:0 6px 24px rgba(0,0,0,.4)',
    ].join(';');

    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px">네이버 읽음처리 PoC</div>
      <label style="display:block;margin-bottom:6px">
        독자 ID(blogId)
        <input id="poc-blog" value="${DEFAULT_BLOG_ID}"
          style="width:100%;margin-top:2px;padding:5px;border-radius:5px;border:1px solid #3a3a40;background:#26262b;color:#fff">
      </label>
      <label style="display:block;margin-bottom:6px">
        글쓴이 ID(publisherId)
        <input id="poc-pub" value="${DEFAULT_PUBLISHER}"
          style="width:100%;margin-top:2px;padding:5px;border-radius:5px;border:1px solid #3a3a40;background:#26262b;color:#fff">
      </label>
      <label style="display:block;margin-bottom:8px">
        글 번호(logNo)
        <input id="poc-log" placeholder="224314481226"
          style="width:100%;margin-top:2px;padding:5px;border-radius:5px;border:1px solid #3a3a40;background:#26262b;color:#fff">
      </label>
      <button id="poc-send"
        style="width:100%;padding:8px;border:0;border-radius:6px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer">
        읽음처리 보내기
      </button>
      <pre id="poc-out"
        style="margin:10px 0 0;padding:8px;max-height:140px;overflow:auto;background:#0f0f12;border-radius:6px;white-space:pre-wrap;word-break:break-all"></pre>
    `;
    document.body.appendChild(panel);

    const out = panel.querySelector('#poc-out');
    const log = (msg) => {
      out.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + out.textContent;
    };

    panel.querySelector('#poc-send').addEventListener('click', () => {
      const blogId = panel.querySelector('#poc-blog').value.trim();
      const publisherId = panel.querySelector('#poc-pub').value.trim();
      const logNo = panel.querySelector('#poc-log').value.trim();

      if (!logNo) {
        log('⚠️ 글 번호(logNo)를 입력하세요.');
        return;
      }
      log(`→ 전송: blogId=${blogId} pub=${publisherId} logNo=${logNo}`);

      markRead(blogId, publisherId, logNo, (err, res) => {
        if (err) {
          log(`❌ 에러: ${JSON.stringify(err)}`);
          return;
        }
        log(`✅ status=${res.status}\nbody=${(res.responseText || '').slice(0, 200)}`);
      });
    });
  }

  if (document.body) {
    buildPanel();
  } else {
    window.addEventListener('DOMContentLoaded', buildPanel);
  }
})();
