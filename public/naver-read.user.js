// ==UserScript==
// @name         merblFilter 네이버 읽음처리
// @namespace    https://merbl-filter.vercel.app/
// @version      1.0.0
// @description  merblFilter에서 클릭한 네이버 글을 실제 네이버 서버에 읽음처리합니다. (읽음처리 외 다른 통신 없음)
// @author       merblFilter
// @match        https://merbl-filter.vercel.app/*
// @match        http://localhost/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @connect      www.naver.com
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://merbl-filter.vercel.app/naver-read.user.js
// @updateURL    https://merbl-filter.vercel.app/naver-read.user.js
// @noframes
// ==/UserScript==

"use strict";
(function () {
  const VERSION = "1.0.0";
  const APP = "merblfilter"; // 페이지(merblFilter)가 보내는 메시지의 source
  const US = "naver-read-userscript"; // 이 스크립트가 보내는 메시지의 source
  const READ_URL =
    "https://www.naver.com/my/blog/BuddyNewPostReadNaverMainAsync.nhn";

  // 페이지로 응답 (location.origin 으로만 — 다른 출처로 새지 않음)
  function reply(type, extra) {
    window.postMessage({ source: US, type, version: VERSION, ...(extra || {}) }, location.origin);
  }

  // 네이버 읽음처리 POST 발사.
  // GM_xmlhttpRequest 는 확장 백그라운드 권한으로 실행되어 SameSite/CORS 를 우회하고
  // naver.com 쿠키를 자동 첨부한다. (사용자가 같은 브라우저에서 네이버 로그인 상태여야 함)
  function markRead(blogId, publisherId, logNo) {
    if (!blogId || !publisherId || !logNo) return;

    const body =
      "blogId=" + encodeURIComponent(blogId) +
      "&logNo=" + encodeURIComponent(logNo) +
      "&serviceLogTypeValue=0&readYn=true" +
      "&publisherId=" + encodeURIComponent(publisherId);

    GM_xmlhttpRequest({
      method: "POST",
      url: READ_URL,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // 네이버가 Referer 를 확인하는 경우 대비 (실제 호출과 동일하게)
        Referer: "https://www.naver.com/",
      },
      data: body,
      onload: function (res) {
        const ok = res.status >= 200 && res.status < 300;
        console.log("[naver-read] markRead", logNo, "status=", res.status, ok ? "OK" : "FAIL");
        reply("MARK_READ_RESULT", { ok: ok, status: res.status, logNo: logNo });
      },
      onerror: function (err) {
        console.log("[naver-read] markRead ERROR", logNo, err);
        reply("MARK_READ_RESULT", { ok: false, status: 0, logNo: logNo });
      },
    });
  }

  function init() {
    // 설치 표식 — 페이지가 동기적으로 읽어 설치 여부/버전을 판정한다.
    document.documentElement.dataset.naverRead = VERSION;

    // 페이지로부터의 메시지 수신.
    // ※ ev.source !== window 로 거르면 Tampermonkey 샌드박스에서 모든 메시지가
    //    막힌다. origin 으로 검사할 것.
    window.addEventListener("message", function (ev) {
      if (ev.origin !== location.origin) return;
      const d = ev.data;
      if (!d || d.source !== APP) return;

      if (d.type === "PING") {
        reply("READY");
        return;
      }
      if (d.type === "NAVER_MARK_READ") {
        markRead(d.blogId, d.publisherId, d.logNo);
      }
    });

    // 로드 시 즉시 한 번 알림 (배너가 이미 떠 있으면 바로 감지)
    reply("READY");
  }

  init();
})();
