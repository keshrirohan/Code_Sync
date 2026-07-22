import { type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],

  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          // "repo" scope lets us create repos and commit files on behalf of the user
          scope: "read:user user:email repo",
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ account }) {
      // Persist the GitHub access token on the Account record
      if (account?.provider === "github" && account.access_token) {
        await prisma.account.updateMany({
          where: {
            provider: "github",
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
          },
        });
      }
      return true;
    },

    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        // Fetch GitHub username and access token from the Account record
        const account = await prisma.account.findFirst({
          where: { userId: user.id, provider: "github" },
          select: { access_token: true },
        });

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { githubUsername: true },
        });

        session.user.githubUsername = dbUser?.githubUsername;
        session.accessToken = account?.access_token ?? undefined;
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // When a new user signs up, create default settings
      await prisma.settings.create({
        data: {
          userId: user.id,
          autoSync: true,
        },
      });
    },

    async linkAccount({ account, profile }) {
      // Store the GitHub username on the User record
      if (account.provider === "github" && profile) {
        const githubProfile = profile as unknown as { login?: string; id?: number };
        await prisma.user.update({
          where: { id: account.userId },
          data: {
            githubId: String(githubProfile.id),
            githubUsername: githubProfile.login,
          },
        });
      }
    },

  },

  pages: {
    signIn: "/",
  },

  session: {
    strategy: "database",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
