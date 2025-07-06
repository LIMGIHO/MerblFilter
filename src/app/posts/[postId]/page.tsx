'use client';
import { useEffect, useState } from 'react';

interface Comment {
  contents: string;
  userId: string;
  replyAll?: Comment[];
}

async function fetchComments(postId: string): Promise<Comment[]> {
  const objectId = `blog_ranto28_${postId}`;
  const params = new URLSearchParams({
    ticket: 'blog',
    templateId: 'default',
    pool: 'cbox5',
    lang: 'ko',
    country: 'KR',
    objectId,
    pageSize: '100',
    page: '1',
    sort: 'new',
    includeAllStatus: 'true',
  });
  const res = await fetch(
    `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?${params}`,
    {
      headers: {
        Referer: `https://blog.naver.com/ranto28/${postId}`,
      },
    }
  );
  const text = await res.text();
  const json = JSON.parse(text.replace(/^[^(]*\(|\);?$/g, ''));
  return json.result.commentList as Comment[];
}

export default function PostComments({ params }: { params: { postId: string } }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filtered, setFiltered] = useState(false);

  useEffect(() => {
    fetchComments(params.postId).then(setComments);
  }, [params.postId]);

  const displayed = filtered
    ? comments.flatMap((c) =>
        c.replyAll?.filter((r) => r.userId === 'ranto28') ?? []
      )
    : comments;

  return (
    <main className="p-6 space-y-4">
      <iframe
        src={`https://blog.naver.com/ranto28/${params.postId}`}
        className="w-full h-96 border"
      />
      <div className="space-x-2">
        <button
          className={`underline ${!filtered ? 'font-bold' : ''}`}
          onClick={() => setFiltered(false)}
        >
          원래 댓글 내역 보기
        </button>
        <button
          className={`underline ${filtered ? 'font-bold' : ''}`}
          onClick={() => setFiltered(true)}
        >
          필터 된 댓글 보기
        </button>
      </div>
      <ul className="space-y-2 list-disc pl-6">
        {displayed.map((comment, idx) => (
          <li key={idx}>{comment.contents}</li>
        ))}
      </ul>
    </main>
  );
}
