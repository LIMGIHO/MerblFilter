import { XMLParser } from 'fast-xml-parser';
import { getServerSession } from 'next-auth';
import { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../auth/[...nextauth]/route';

interface ExtendedSession extends Session {
  accessToken?: string;
}

// JSESSIONID를 저장할 변수
let lastJsessionId: string | null = null;

export async function GET() {
  const session = (await getServerSession(authOptions)) as ExtendedSession;
    
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
  
  const items = data.rss.channel.item as Array<any>;
  const image = data.rss.channel.image.url;
  const author = data.rss.channel.title.replace('의 블로그', '');

  let visitedPosts: string[] = [];
  
  // 로그인된 상태라면 읽은 글 정보 가져오기
  if (session?.accessToken) {
    try {
      const cookieArray = [
        'NAC=zD1jBsQEYD60',
        'NNB=K5742SE3O5TWQ',
        'tooltipDisplayed=true',
        'ba.uuid=8c20250b-026d-4443-baf5-996ed9ebfeb9',
        'tooltip_shoppingbox_close=1',
        'PM_CK_loc=894ff9760d84b674ec1d3db3b4f0ccbdd6c6957ae396ff69ec1b5517bc35d3d3',
        'NACT=1',
        'NM_srt_chzzk=1',
        'SRT30=1752668383',
        'nid_inf=1851701676',
        'NID_AUT=dPAiLWbutL7htVdbmAHI6iZl9K5LPUBxHm2OhJsfotBkOBlbGfY7lAlg0jyRjU7G',
        'NID_SES=AAABnMQeGvlHPVrfVHsRU5PQKPyP7WRxpm9rMa7/PcW9IX5OVVspQCts/GXn3vYJSMABhdbrpNrMWqINapc7yjYF9lNzjMzMVQQGJ7xnckvsVgb+J9sbHnDwZtJYjWtVFq9swoBQcPnmnR3Do7nwUxGj+Euc0uQTmP6Q0NlDoXbV/DAiyaUK3SDX1PR9D5ER1CPRZDeSkw6LNM5fZy/BZ4Lbm34QBqFZNoHHHxKbAQqAFkQFcinLFRT7YGib7aiDbsh9ucUjqtQahPKCaWuHsp7Xk2mxCIr/8p9XsFIArAODQ76l3IBYNzwr4TlxYeEkoL7q3cMSlRd9WkjDSkjL0Sba+Ayha9eGsRtB1cIpnXQVdBaVir2r+QQRx1Eysr+HFG7b1F7P64tzO6fbDx7IzvIPJudsUvirnX5gdrD+RJJFSpdrTpW0itIR5iFZsY4WZ2MU7cliaA7JFBNSnfUFhfZPicRXWCcP29r8vFLHNGt1KNGmOH2wBXBK7aHw35CQBj+WO17oYMNqgOj0rFeae0cYPT+ZqXDCsTjjIX2cONUg8Q1p',
        'BUC=d8cuY97Z5XgJ2n7Ec4gZgKLxO-KAay-C4SrMxNVLlfg'
      ];

      const cookieString = cookieArray.join('; ');
      
      const visitedRes = await fetch('https://www.naver.com/my/blog/BuddyNewPostListNaverMainV3.nhn', {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Referer': 'https://www.naver.com/',
          'Connection': 'keep-alive'
        }
      });
      
      const visitedHtml = await visitedRes.text();
      console.log("visitedHtml", visitedHtml);
      
      // 여러 가지 패턴으로 읽은 글 찾기
      const visitedPatterns = [
        // 패턴 1: is_visited 클래스가 있는 요소
        /class="[^"]*is_visited[^"]*"[^>]*data-post-id="(\d+)"/g,
        // 패턴 2: 읽은 글 표시가 있는 요소
        /data-post-id="(\d+)"[^>]*class="[^"]*visited[^"]*"/g,
        // 패턴 3: 특정 클래스와 함께 postId
        /postId["\s]*[:=]["\s]*["']?(\d+)["']?[^>]*class="[^"]*read[^"]*"/g,
        // 패턴 4: 간단한 postId 추출 (임시)
        /blog\.naver\.com\/ranto28\/(\d+)/g
      ];
      
      for (const pattern of visitedPatterns) {
        const matches = visitedHtml.match(pattern);
        if (matches && matches.length > 0) {
          visitedPosts = matches.map(match => {
            const postId = match.match(/(\d+)/)?.[1];
            return postId || '';
          }).filter(id => id);
          break;
        }
      }
    } catch (error) {
      console.error('Error fetching visited posts:', error);
    }
  }

  // RSS 아이템을 포스트 형식으로 변환
  const posts = items.map(item => {
    // postId 추출 로직 수정
    const postId = item.link.split('/').pop()?.split('?')[0] || '';
    
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