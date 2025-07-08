'use client';

import { useSession } from 'next-auth/react';

export default function SessionManager() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div className="text-sm text-gray-600 whitespace-nowrap">
        {session.user?.name}님
      </div>
    );
  }

  return null;
} 