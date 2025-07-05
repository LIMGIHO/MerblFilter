# 네이버 블로그 댓글 필터링 서비스 개발 노트

## 1. 개요

- **목적**: 특정 네이버 블로거의 블로그에서, 블로거가 ‘대댓글’을 단 댓글만 필터링해서 보여주는 웹 서비스 구현
- **구현방식**: 프론트엔드는 Next.js 활용, 댓글 데이터 수집/필터링은 서버 API(프록시)에서 처리

---

## 2. 주요 기능 및 요구사항

- 네이버 로그인
- 로그인 후 특정 블로그의 게시글 목록 화면
- 게시글 선택
- 해당 게시글 댓글 로딩
- 블로거(주인)가 대댓글을 단 댓글만 필터링
- 결과를 웹에서 확인(별도 DB 저장 불필요)

---

## 3. 기술 스택 및 구조

- **프론트엔드**: Next.js (정적 사이트 + 서버 API 통합 관리)
- **서버(API Route)**: Next.js API Route로 프록시 서버 구현
- **배포**: Vercel, Netlify 등 정적/서버리스 환경 추천
- **네이버 OAuth**: next-auth 등으로 “네이버 아이디로 로그인” 연동

---

## 4. 데이터 수집 방식

### 프록시 서버(API Route) 활용
- 프론트에서 `/api/naver-comments?blogId=xxx&logNo=yyy`로 요청
- 서버(API Route)에서 네이버에 직접 AJAX 요청 후, 응답을 프론트로 전달
- CORS 문제 해결
- 실시간 데이터 활용 가능(단, 비공식 API는 네이버 정책에 따라 차단될 수도 있음)

---

## 5. 네이버 OAuth(네이버 아이디로 로그인) 연동

- 네이버 OAuth로 사용자 인증 → Access Token 획득
- 공식 API 활용시 토큰으로 일부 블로그 데이터 접근 가능
- 공식 API로 댓글/글 목록을 모두 제공하지 않을 수 있음
- 비공식(웹 ajax) 엔드포인트 사용시 서버에서 사용자 토큰/쿠키로 네이버에 대행 요청
- 개인/테스트/소규모 서비스에서는 실질적 구현 가능, 공개 서비스/상업 서비스는 정책 위반 주의

---

## 6. Next.js에서의 프록시 서버(예시 코드)

**`/pages/api/naver-comments.js`**
```js
import axios from 'axios';

export default async function handler(req, res) {
  const { blogId, logNo } = req.query;
  const url = `https://blog.naver.com/CommentList.naver?blogId=${blogId}&logNo=${logNo}`;

  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    res.status(200).send(data);
  } catch (err) {
    res.status(500).json({ error: '네이버 요청 실패', details: err.message });
  }
}
