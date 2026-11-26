import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { prisma } = await import("@/lib/db");
        const bcrypt = await import("bcryptjs");

        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash || user.deletedAt) return null;

        if (!user.emailVerified) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: "/en/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token.id) return session;

      const userId = token.id as string;

      try {
        const { prisma } = await import("@/lib/db");

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { sessionVersion: true, deletedAt: true },
        });

        if (!user || user.deletedAt) {
          return { ...session, user: undefined };
        }

        if (token.sessionVersion !== user.sessionVersion) {
          return { ...session, user: undefined };
        }

        session.user.id = userId;
      } catch (error) {
        console.error("[auth] session validation failed", error);
      }

      return session;
    },
  },
});
