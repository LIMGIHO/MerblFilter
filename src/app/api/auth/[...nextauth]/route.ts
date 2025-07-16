import NextAuth from 'next-auth';
import NaverProvider from 'next-auth/providers/naver';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';

interface ExtendedToken extends JWT {
  accessToken?: string;
}

interface ExtendedSession extends Session {
  accessToken?: string;
}

export const authOptions = {
  providers: [
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID || '',
      clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async jwt({ token, account, trigger, session }: { token: ExtendedToken; account: any; trigger?: string; session?: any }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }: { session: ExtendedSession; token: ExtendedToken }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
  debug: false,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
