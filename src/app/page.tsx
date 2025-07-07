// 'use client';

// import { signIn, signOut, useSession } from 'next-auth/react';
// import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function Home() {
  // const { data: session } = useSession();
  // const session = false;

  // useEffect(() => {
    
  // }, []);

  // return (
  //   <main className="p-6 space-y-4">
  //     {session ? (
  //       <div className="space-y-2">
  //         {/* <p>Signed in as {session.user?.name}</p> */}
  //         <button className="underline" onClick={() => signOut()}>
  //           Sign out
  //         </button>
  //       </div>
  //     ) : (
  //       <button className="underline" onClick={() => signIn('naver')}>
  //         Sign in with Naver
  //       </button>
  //     )}
  //     <div>
  //       <Link href="/posts" className="underline">
  //         View Blog Posts
  //       </Link>
  //     </div>
  //   </main>
  // );

  // 메인 페이지 접속 시 자동으로 게시글 목록으로 리다이렉트
  redirect('/posts');
}
