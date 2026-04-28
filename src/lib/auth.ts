import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { encryptToken } from "@/lib/crypto/tokens";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "auth" });

/**
 * Persiste tokens OAuth de Google en `email_accounts` y `users` cuando
 * NextAuth se autentica. Esto permite que CalendarPanel/DrivePanel/TasksPanel
 * funcionen sin que el usuario tenga que pasar por /api/email-accounts/connect
 * (que requiere tener registrado un redirect_uri adicional en Google Cloud
 * Console — error reportado 2026-04-28: redirect_uri_mismatch).
 *
 * El callback /api/auth/callback/google YA está registrado en GCC (es el
 * default de NextAuth). Aprovechamos ese flujo para grabar los tokens.
 */
async function persistGoogleTokens(params: {
  userEmail: string;
  userName: string | null;
  userImage: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
}): Promise<string | null> {
  try {
    // Asegurar que el user existe en `users` (NextAuth con JWT no lo crea por defecto)
    let userRecord = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.email, params.userEmail),
      columns: { id: true },
    });
    if (!userRecord) {
      const id = crypto.randomUUID();
      await db.insert(schema.users).values({
        id,
        email: params.userEmail,
        name: params.userName || null,
        image: params.userImage || null,
        emailVerified: new Date(),
      });
      userRecord = { id };
      log.info({ userId: id, email: params.userEmail }, "user created on first sign-in");
    }

    // Upsert en email_accounts (provider="google")
    const existing = await db.query.emailAccounts.findFirst({
      where: and(
        eq(schema.emailAccounts.userId, userRecord.id),
        eq(schema.emailAccounts.email, params.userEmail),
      ),
    });

    const tokenData = {
      accessToken: encryptToken(params.accessToken) ?? params.accessToken,
      refreshToken: params.refreshToken
        ? encryptToken(params.refreshToken) || params.refreshToken
        : existing?.refreshToken || null,
      expiresAt: params.expiresAt || Math.floor(Date.now() / 1000) + 3600,
      scope: params.scope || null,
    };

    if (existing) {
      await db
        .update(schema.emailAccounts)
        .set({
          ...tokenData,
          enabled: true,
          displayName: params.userName || existing.displayName,
          updatedAt: new Date(),
        })
        .where(eq(schema.emailAccounts.id, existing.id));
    } else {
      await db.insert(schema.emailAccounts).values({
        userId: userRecord.id,
        provider: "google",
        email: params.userEmail,
        displayName: params.userName || null,
        ...tokenData,
        isPrimary: true,
        enabled: true,
      });
      log.info({ userId: userRecord.id, email: params.userEmail }, "email_account created on sign-in");
    }
    return userRecord.id;
  } catch (e) {
    logError(log, e, { email: params.userEmail }, "persist google tokens failed");
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/tasks.readonly",
            "https://www.googleapis.com/auth/contacts.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // En cada login Google: grabar/refrescar los tokens en email_accounts
      // para que CalendarPanel/DrivePanel/TasksPanel funcionen.
      if (account?.provider === "google" && account.access_token && user.email) {
        await persistGoogleTokens({
          userEmail: user.email,
          userName: user.name || (profile as { name?: string } | null)?.name || null,
          userImage: user.image || null,
          accessToken: account.access_token,
          refreshToken: account.refresh_token || null,
          expiresAt: typeof account.expires_at === "number" ? account.expires_at : null,
          scope: typeof account.scope === "string" ? account.scope : null,
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      // Si el JWT no tiene id pero sí email, hidratar id desde DB
      if (!token.id && token.email) {
        const u = await db.query.users.findFirst({
          where: (t, { eq }) => eq(t.email, token.email as string),
          columns: { id: true },
        });
        if (u) token.id = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
