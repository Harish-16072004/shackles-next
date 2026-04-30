import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "your@email.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Validate input
        const validatedCredentials = credentialsSchema.safeParse(credentials);
        if (!validatedCredentials.success) {
          return null;
        }

        const { email, password } = validatedCredentials.data;

        // Find user
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        // Check password
        const passwordMatch = await compare(password, user.password);
        if (!passwordMatch) {
          return null;
        }

        // Return user object for session
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * jwt callback — runs when a token is created or updated.
     * Stores id and role from the user object (available on first sign-in).
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    /**
     * session callback — shapes the session object exposed to the client.
     * Reads id and role from the JWT token.
     */
    async session(params: any) {
      const { session, token } = params;
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60,  // 1 day
  },
  events: {
    async signIn({ user }) {
      console.log(`[Auth] User signed in: ${user?.email}`);
    },
    async signOut({ token }: any) {
      console.log(`[Auth] User signed out: ${token?.email}`);
    },
  },
});

