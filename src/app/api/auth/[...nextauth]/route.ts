// This file is renamed to '.route.ts.bak' to disable it for static export
// It is preserved here for reference and can be re-enabled for server environments

export const dynamic = 'force-dynamic';
export const runtime = 'edge'; // Use the Edge Runtime
export const revalidate = 0; // Disable Cache: ensures the route is always server-side evaluated

import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Configure authentication options
const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  // Our custom callbacks
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      const isAllowedToSignIn = true;
      if (isAllowedToSignIn) {
        return true;
      } else {
        // Return false to display a default error message
        return false;
        // Or you can return a URL to redirect to:
        // return '/unauthorized'
      }
    },
    async session({ session, token, user }) {
      // Send properties to the client, like an access_token and user id from a provider
      if (token && session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and or the user id to the token right after sign in
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    }
  },
  // Other NextAuth configurations
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST }; 