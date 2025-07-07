import { NextRequest, NextResponse } from 'next/server';
import { BlogComment } from '@/app/types/comments';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 });
  }
  // 실제 네이버 블로그에서 사용하는 값으로 세팅
  const blogId = 'ranto28';
  const logNo = postId;
  const groupId = '35863879';
  const objectId = `35863879_201_${postId}`;

  try {
    // 모든 페이지의 댓글을 합쳐서 반환
    const allComments = await fetchAllNaverComments({ blogId, logNo, groupId, objectId });
    return NextResponse.json({
      success: true,
      result: {
        commentList: allComments
      }
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch comments',
      result: {
        commentList: []
      }
    }, { status: 500 });
  }
}

async function fetchAllNaverComments({ blogId, logNo, groupId, objectId }: { blogId: string, logNo: string, groupId: string, objectId: string }) {
  let allComments: BlogComment[] = [];
  
  // 1단계: 첫 번째 요청으로 총 페이지 수 파악
  const initParams = new URLSearchParams({
    ticket: 'blog',
    templateId: 'default',
    pool: 'blogid',
    _cv: '20250625161346',
    _callback: `jQuery32108289357807814356_${Date.now()}`,
    lang: 'ko',
    country: '',
    objectId: objectId,
    categoryId: '',
    pageSize: '50',
    indexSize: '10',
    groupId: groupId,
    listType: 'OBJECT',
    pageType: 'default',
    page: '1',
    initialize: 'true',
    followSize: '5',
    userType: '',
    useAltSort: 'true',
    replyPageSize: '10',
    showReply: 'true',
    _: Date.now().toString()
  });

  const initUrl = `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?${initParams.toString()}`;
  // console.log(`===초기 요청 URL===`, initUrl);
  
  try {
    const initRes = await fetch(initUrl, {
      headers: {
        'accept': '*/*',
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'referer': `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`,
      }
    });
    
    const initText = await initRes.text();
    const initJson = JSON.parse(initText.replace(/^[^(]*\(|\);?$/g, ''));
    
    // console.log(`===초기 요청 응답===`, initJson);
    
    if (!initJson.success) {
      console.log(`===초기 요청 실패===`, initJson.message);
      return [];
    }
    
    const totalPages = initJson?.result?.pageModel?.totalPages || 1;
    const currentPageFromInit = initJson?.result?.pageModel?.page || 1;
    
    // console.log(`===총 페이지 수: ${totalPages}, 현재 페이지: ${currentPageFromInit}===`);
    
    // 첫 번째 요청의 댓글도 추가
    const initComments = initJson?.result?.commentList ?? [];
    // console.log(`===초기 댓글 개수: ${initComments.length}===`);
    allComments = allComments.concat(initComments);
    
    // 2단계: 마지막 페이지부터 1페이지까지 역순으로 요청
    for (let page = totalPages; page >= 1; page--) {
      // 이미 가져온 페이지는 건너뛰기
      if (page === currentPageFromInit) {
        // console.log(`===페이지 ${page} 이미 가져옴, 건너뜀===`);
        continue;
      }
      
      // console.log(`===페이지 ${page} 요청 중===`);
      
      const params = new URLSearchParams({
        ticket: 'blog',
        templateId: 'default',
        pool: 'blogid',
        _cv: '20250625161346',
        _callback: `jQuery32108289357807814356_${Date.now()}`,
        lang: 'ko',
        country: '',
        objectId: objectId,
        categoryId: '',
        pageSize: '50',
        indexSize: '10',
        groupId: groupId,
        listType: 'OBJECT',
        pageType: 'default',
        page: page.toString(),
        currentPage: currentPageFromInit.toString(),
        refresh: 'false',
        sort: 'REVERSE_NEW',
        followSize: '5',
        userType: '',
        useAltSort: 'true',
        replyPageSize: '10',
        showReply: 'true',
        _: Date.now().toString()
      });

      const apiUrl = `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?${params.toString()}`;
      // console.log(`===페이지 ${page} API URL===`, apiUrl);
      
      try {
        const res = await fetch(apiUrl, {
          headers: {
            'accept': '*/*',
            'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'referer': `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`,
          }
        });
                
        const text = await res.text();
        const json = JSON.parse(text.replace(/^[^(]*\(|\);?$/g, ''));
        
        if (!json.success) {
          // console.log(`===페이지 ${page} API 에러===`, json.message);
          continue;
        }
        
        const comments = json?.result?.commentList ?? [];
                
        if (comments.length > 0) {
          allComments = allComments.concat(comments);
        }
        
      } catch (fetchError) {
        console.log(`===페이지 ${page} fetch 에러===`, fetchError);
        continue;
      }
    }
    
  } catch (error) {
    console.log(`===초기 요청 에러===`, error);
    return [];
  }
  
  return allComments;
}
