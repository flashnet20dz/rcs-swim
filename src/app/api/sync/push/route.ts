import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// موديلات "معاملات" — append-only، لا يوجد تعارض ممكن، فقط "أضِف إذا غير موجود"
const APPEND_ONLY_MODELS = new Set(["payment", "renewal", "attendance"]);

// موديلات "وصفية" — تُحل بالتعارض عبر updatedAt (آخر تعديل يفوز)
const METADATA_MODELS = new Set(["subscriber"]);

interface SyncChange {
  modelName: string;
  recordId: string;
  operation: "create" | "update" | "delete";
  payload: Record<string, any>;
}

/**
 * POST /api/sync/push
 * يستقبل دفعة تغييرات من فرع أوفلاين (Electron) ويطبّقها على قاعدة البيانات السحابية.
 * المصادقة: header X-Club-Api-Key يطابق Club.syncApiKey.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("X-Club-Api-Key");
    if (!apiKey) {
      return NextResponse.json({ error: "مفتاح المزامنة مفقود" }, { status: 401 });
    }

    const club = await db.club.findUnique({ where: { syncApiKey: apiKey } });
    if (!club) {
      return NextResponse.json({ error: "مفتاح المزامنة غير صالح" }, { status: 401 });
    }

    const body = await req.json();
    const changes: SyncChange[] = body.changes || [];

    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const change of changes) {
      try {
        const { modelName, recordId, operation, payload } = change;
        const model = (db as any)[modelName];
        if (!model) {
          skipped++;
          continue;
        }

        // عزل صارم بين النوادي: أي سجل لا ينتمي لهذا النادي يُرفض
        if (payload?.clubId && payload.clubId !== club.id) {
          skipped++;
          continue;
        }
        if ("clubId" in payload) payload.clubId = club.id;

        if (operation === "delete") {
          await model.update({
            where: { id: recordId },
            data: { deletedAt: new Date() },
          }).catch(() => {});
          applied++;
          continue;
        }

        if (APPEND_ONLY_MODELS.has(modelName)) {
          await model.upsert({
            where: { id: recordId },
            create: payload,
            update: {},
          });
          applied++;
        } else if (METADATA_MODELS.has(modelName)) {
          const existing = await model.findUnique({ where: { id: recordId } });
          if (!existing || new Date(payload.updatedAt) > new Date(existing.updatedAt)) {
            await model.upsert({
              where: { id: recordId },
              create: payload,
              update: payload,
            });
            applied++;
          } else {
            skipped++;
          }
        } else {
          await model.upsert({ where: { id: recordId }, create: payload, update: payload });
          applied++;
        }
      } catch (err: any) {
        errors.push(`${change.modelName}/${change.recordId}: ${err?.message || "خطأ غير معروف"}`);
      }
    }

    return NextResponse.json({ applied, skipped, errors, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error("POST /api/sync/push:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
