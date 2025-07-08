import NextAuth from 'next-auth';
import NaverProvider from 'next-auth/providers/naver';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';

interface ExtendedToken extends JWT {
  accessToken?: string;
  sessionToken?: string;
  jklToken?: string;
}

interface ExtendedSession extends Session {
  accessToken?: string;
  sessionToken?: string;
  jklToken?: string;
}

export const authOptions = {
  providers: [
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID || '',
      clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async jwt({ token, account }: { token: ExtendedToken; account: any }) {
      if (account) {
        token.accessToken = account.access_token;
        token.sessionToken = account.session_token;
        token.jklToken = account.jkl_token;
      }
      return token;
    },
    async session({ session, token }: { session: ExtendedSession; token: ExtendedToken }) {
      session.accessToken = token.accessToken;
      session.sessionToken = token.sessionToken;
      session.jklToken = token.jklToken;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
