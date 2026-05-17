'use client';

import dynamic from 'next/dynamic';

const PostComments = dynamic(() => import('./PostComments'), { ssr: false });

export default function PostCommentsWrapper({ postId, blogId }: { postId: string; blogId?: string }) {
  return <PostComments postId={postId} blogId={blogId} />;
}
