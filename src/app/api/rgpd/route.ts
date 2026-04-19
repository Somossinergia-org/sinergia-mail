import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gdprConsents,
  gdprRetentionPolicies,
  gdprDeletionRequests,
  gdprProcessingActivities,
} from "@/db/schema-rgpd";
import { eq, and, desc } from "drizzle-orm";

// ─── GET: List all RGPD data for current user ───

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const url = req.nextUrl;
  const section = url.searchParams.get("section"); // consents | retention | requests | activities

  try {
    if (section === "consents") {
      const rows = await db
        .select()
        .from(gdprConsents)
        .where(eq(gdprConsents.userId, userId))
        .orderBy(desc(gdprConsents.createdAt))
        .limit(200);
      return NextResponse.json({ consents: rows });
    }

    if (section === "retention") {
      const rows = await db
        .select()
        .from(gdprRetentionPolicies)
        .where(eq(gdprRetentionPolicies.userId, userId))
        .orderBy(desc(gdprRetentionPolicies.createdAt));
      return NextResponse.json({ policies: rows });
    }

    if (section === "requests") {
      const rows = await db
        .select()
        .from(gdprDeletionRequests)
        .where(eq(gdprDeletionRequests.userId, userId))
        .orderBy(desc(gdprDeletionRequests.createdAt))
        .limit(100);
      return NextResponse.json({ requests: rows });
    }

    if (section === "activities") {
      const rows = await db
        .select()
        .from(gdprProcessingActivities)
        .where(eq(gdprProcessingActivities.userId, userId))
        .orderBy(desc(gdprProcessingActivities.createdAt));
      return NextResponse.json({ activities: rows });
    }

    // Default: return all sections with counts
    const [consents, policies, requests, activities] = await Promise.all([
      db
        .select()
        .from(gdprConsents)
        .where(eq(gdprConsents.userId, userId))
        .orderBy(desc(gdprConsents.createdAt))
        .limit(200),
      db
        .select()
        .from(gdprRetentionPolicies)
        .where(eq(gdprRetentionPolicies.userId, userId))
        .orderBy(desc(gdprRetentionPolicies.createdAt)),
      db
        .select()
        .from(gdprDeletionRequests)
        .where(eq(gdprDeletionRequests.userId, userId))
        .orderBy(desc(gdprDeletionRequests.createdAt))
        .limit(100),
      db
        .select()
        .from(gdprProcessingActivities)
        .where(eq(gdprProcessingActivities.userId, userId))
        .orderBy(desc(gdprProcessingActivities.createdAt)),
    ]);

    return NextResponse.json({
      consents,
      policies,
      requests,
      activities,
      stats: {
        totalConsents: consents.length,
        activeConsents: consents.filter((c) => c.granted && !c.revokedAt).length,
        activePolicies: policies.filter((p) => p.enabled).length,
        pendingRequests: requests.filter((r) => r.status === "pending").length,
        totalActivities: activities.length,
      },
    });
  } catch (error) {
    console.error("[RGPD] GET error:", error);
    return NextResponse.json(
      { error: "Error al obtener datos RGPD" },
      { status: 500 }
    );
  }
}

// ─── POST: Create RGPD records ───

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create consent ──
    if (action === "create_consent") {
      const {
        contactEmail,
        consentType,
        granted,
        source,
        ipAddress,
        consentText,
        expiresAt,
      } = body;

      if (!contactEmail || !consentType) {
        return NextResponse.json(
          { error: "contactEmail y consentType son requeridos" },
          { status: 400 }
        );
      }

      const [row] = await db
        .insert(gdprConsents)
        .values({
          userId,
          contactEmail,
          consentType,
          granted: granted ?? true,
          source: source || "web_form",
          ipAddress: ipAddress || null,
          consentText: consentText || null,
          grantedAt: granted ? new Date() : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
        .returning();

      return NextResponse.json({ consent: row }, { status: 201 });
    }

    // ── Revoke consent ──
    if (action === "revoke_consent") {
      const { consentId } = body;
      if (!consentId) {
        return NextResponse.json(
          { error: "consentId es requerido" },
          { status: 400 }
        );
      }

      const [row] = await db
        .update(gdprConsents)
        .set({ granted: false, revokedAt: new Date() })
        .where(
          and(eq(gdprConsents.id, consentId), eq(gdprConsents.userId, userId))
        )
        .returning();

      if (!row) {
        return NextResponse.json(
          { error: "Consentimiento no encontrado" },
          { status: 404 }
        );
      }

      return NextResponse.json({ consent: row });
    }

    // ── Create / update retention policy ──
    if (action === "upsert_retention") {
      const { dataType, retentionDays, retentionAction, enabled } = body;

      if (!dataType || !retentionDays || !retentionAction) {
        return NextResponse.json(
          { error: "dataType, retentionDays y retentionAction son requeridos" },
          { status: 400 }
        );
      }

      // Check if policy exists for this data type
      const existing = await db
        .select()
        .from(gdprRetentionPolicies)
        .where(
          and(
            eq(gdprRetentionPolicies.userId, userId),
            eq(gdprRetentionPolicies.dataType, dataType)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [row] = await db
          .update(gdprRetentionPolicies)
          .set({
            retentionDays,
            action: retentionAction,
            enabled: enabled ?? true,
          })
          .where(eq(gdprRetentionPolicies.id, existing[0].id))
          .returning();
        return NextResponse.json({ policy: row });
      }

      const [row] = await db
        .insert(gdprRetentionPolicies)
        .values({
          userId,
          dataType,
          retentionDays,
          action: retentionAction,
          enabled: enabled ?? true,
        })
        .returning();

      return NextResponse.json({ policy: row }, { status: 201 });
    }

    // ── Create deletion request ──
    if (action === "create_request") {
      const { requestedBy, requestType, dataScope, notes } = body;

      if (!requestedBy || !requestType) {
        return NextResponse.json(
          { error: "requestedBy y requestType son requeridos" },
          { status: 400 }
        );
      }

      const [row] = await db
        .insert(gdprDeletionRequests)
        .values({
          userId,
          requestedBy,
          requestType,
          dataScope: dataScope || [],
          notes: notes || null,
          status: "pending",
        })
        .returning();

      return NextResponse.json({ request: row }, { status: 201 });
    }

    // ── Update deletion request status ──
    if (action === "update_request") {
      const { requestId, status, notes } = body;

      if (!requestId || !status) {
        return NextResponse.json(
          { error: "requestId y status son requeridos" },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = { status };
      if (notes !== undefined) updateData.notes = notes;
      if (status === "completed") updateData.completedAt = new Date();

      const [row] = await db
        .update(gdprDeletionRequests)
        .set(updateData)
        .where(
          and(
            eq(gdprDeletionRequests.id, requestId),
            eq(gdprDeletionRequests.userId, userId)
          )
        )
        .returning();

      if (!row) {
        return NextResponse.json(
          { error: "Solicitud no encontrada" },
          { status: 404 }
        );
      }

      return NextResponse.json({ request: row });
    }

    // ── Create processing activity ──
    if (action === "create_activity") {
      const {
        activityName,
        purpose,
        legalBasis,
        dataCategories,
        dataSubjects,
        recipients,
        retentionPeriod,
        securityMeasures,
      } = body;

      if (!activityName || !purpose || !legalBasis) {
        return NextResponse.json(
          { error: "activityName, purpose y legalBasis son requeridos" },
          { status: 400 }
        );
      }

      const [row] = await db
        .insert(gdprProcessingActivities)
        .values({
          userId,
          activityName,
          purpose,
          legalBasis,
          dataCategories: dataCategories || [],
          dataSubjects: dataSubjects || null,
          recipients: recipients || null,
          retentionPeriod: retentionPeriod || null,
          securityMeasures: securityMeasures || null,
        })
        .returning();

      return NextResponse.json({ activity: row }, { status: 201 });
    }

    // ── Update processing activity ──
    if (action === "update_activity") {
      const { activityId, ...fields } = body;

      if (!activityId) {
        return NextResponse.json(
          { error: "activityId es requerido" },
          { status: 400 }
        );
      }

      const allowedFields = [
        "activityName",
        "purpose",
        "legalBasis",
        "dataCategories",
        "dataSubjects",
        "recipients",
        "retentionPeriod",
        "securityMeasures",
      ];
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of allowedFields) {
        if (fields[key] !== undefined) {
          updateData[key] = fields[key];
        }
      }

      const [row] = await db
        .update(gdprProcessingActivities)
        .set(updateData)
        .where(
          and(
            eq(gdprProcessingActivities.id, activityId),
            eq(gdprProcessingActivities.userId, userId)
          )
        )
        .returning();

      if (!row) {
        return NextResponse.json(
          { error: "Actividad no encontrada" },
          { status: 404 }
        );
      }

      return NextResponse.json({ activity: row });
    }

    return NextResponse.json(
      { error: `Accion no reconocida: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("[RGPD] POST error:", error);
    return NextResponse.json(
      { error: "Error al procesar solicitud RGPD" },
      { status: 500 }
    );
  }
}
