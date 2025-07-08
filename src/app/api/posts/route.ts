import { XMLParser } from 'fast-xml-parser';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

// JSESSIONID를 저장할 변수
let lastJsessionId: string | null = null;

export async function GET() {
  const session = await getServerSession(authOptions);
  console.log('Session in API:', session);
  
  // RSS 피드 가져오기
  const res = await fetch('https://rss.blog.naver.com/ranto28.xml', { 
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
    }
  });
  const xml = await res.text();
  const parser = new XMLParser({ 
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: false
  });
  const data = parser.parse(xml);
  console.log('First RSS item:', data.rss.channel.item[0]);
  
  const items = data.rss.channel.item as Array<any>;
  const image = data.rss.channel.image.url;
  const author = data.rss.channel.title.replace('의 블로그', '');

  let visitedPosts: string[] = [];
  
  // 로그인된 상태라면 읽은 글 정보 가져오기
  if (session?.accessToken) {
    try {
      const visitedRes = await fetch('https://www.naver.com/my/blog/BuddyNewPostListNaverMainV3.nhn', {
        headers: {
          'Cookie': `NID_AUT=${session.accessToken}; NID_SES=${session.accessToken}; NAC=1; NNB=K5742SE3O5TWQ; NACT=1`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
          'Referer': 'https://www.naver.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
          'Connection': 'keep-alive'
        }
      });
      
      const visitedHtml = await visitedRes.text();
      
      // HTML에서 is_visited 클래스를 가진 li 요소에서 postId 추출
      const visitedMatches = visitedHtml.match(/\/(\d+)" class="sub_text".*?is_visited/g);
      visitedPosts = visitedMatches?.map(match => {
        const postId = match.match(/\/(\d+)"/)?.[1];
        return postId || '';
      }) || [];
      
      console.log('Visited posts:', visitedPosts);
    } catch (error) {
      console.error('Error fetching visited posts:', error);
    }
  }

  // RSS 아이템을 포스트 형식으로 변환
  const posts = items.map(item => {
    const postId = item.link.match(/\/(\d+)$/)?.[1] || '';
    
    // description에서 첫 번째 이미지 URL 추출
    let thumbnail = null;
    if (item.description) {
      const descriptionStr = typeof item.description === 'string' ? item.description : '';
      const imgMatch = descriptionStr.match(/<img.*?src=["'](https?:\/\/[^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        thumbnail = imgMatch[1];
        // 이미지 URL이 상대 경로인 경우 절대 경로로 변환
        if (!thumbnail.startsWith('http')) {
          thumbnail = `https://blog.naver.com${thumbnail}`;
        }
        console.log('Found thumbnail:', thumbnail);
      }
    }

    return {
      title: item.title,
      link: item.link,
      author: author,
      image: image,
      pubDate: item.pubDate,
      postId: postId,
      isVisited: visitedPosts.includes(postId),
      category: item.category || '',
      tag: Array.isArray(item.tag) ? item.tag.join(', ') : (item.tag || ''),
      thumbnail: thumbnail
    };
  });

  return NextResponse.json(posts);
} 