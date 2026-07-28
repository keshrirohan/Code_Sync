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

        // Fetch access token + githubUsername together in one query
        const [account, dbUser] = await Promise.all([
          prisma.account.findFirst({
            where: { userId: user.id, provider: "github" },
            select: { access_token: true },
          }),
          prisma.user.findUnique({
            where: { id: user.id },
            select: { githubUsername: true, githubId: true },
          }),
        ]);

        session.accessToken = account?.access_token ?? undefined;

        if (dbUser?.githubUsername) {
          // Happy path — already stored
          session.user.githubUsername = dbUser.githubUsername;
        } else if (account?.access_token) {
          // Fallback: fetch from GitHub API and persist for next time
          try {
            const ghRes = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
                "User-Agent": "CodeSync",
              },
            });
            if (ghRes.ok) {
              const ghUser = await ghRes.json() as { login: string; id: number };
              if (ghUser.login) {
                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    githubUsername: ghUser.login,
                    githubId: String(ghUser.id),
                  },
                });
                session.user.githubUsername = ghUser.login;
              }
            }
          } catch {
            // Non-fatal — session still works without username
          }
        }
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      await prisma.settings.create({
        data: {
          userId: user.id,
          autoSync: true,
        },
      });
    },

    async linkAccount({ account, profile }) {
      if (account.provider === "github" && profile) {
        const githubProfile = profile as unknown as { login?: string; id?: number };
        if (githubProfile.login) {
          await prisma.user.update({
            where: { id: account.userId },
            data: {
              githubId: String(githubProfile.id),
              githubUsername: githubProfile.login,
            },
          });
        }
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
