'use client';

import dynamic from 'next/dynamic';

const PostComments = dynamic(() => import('./PostComments'), {
  ssr: false,
});

export default function PostCommentsWrapper({ postId }: { postId: string }) {
  return <PostComments postId={postId} />;
} 