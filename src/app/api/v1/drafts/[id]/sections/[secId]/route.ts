import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/session";
import { stripLeadingSectionTitle } from "@/lib/writing/strip-section-title";
import {
  authErrorResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

interface UpdateSectionBody {
  content?: string;
  selectedSource?: "a" | "b";
  constraints?: string;
  estimatedWords?: number;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; secId: string }> }
): Promise<Response> {
  const user = await getAuthUser();
  if (!user) {
    return authErrorResponse();
  }

  const { id: draftId, secId: sectionId } = await params;

  try {
    const draft = await db.draft.findFirst({
      where: { id: draftId, userId: user.id },
      select: { id: true },
    });
    if (!draft) {
      return errorResponse({ code: "draftNotFound", message: "Draft not found" }, 404);
    }

    const section = await db.section.findFirst({
      where: { id: sectionId, draftId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!section) {
      return errorResponse({ code: "sectionNotFound", message: "Section not found" }, 404);
    }

    return successResponse(section);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; secId: string }> }
): Promise<Response> {
  const user = await getAuthUser();
  if (!user) {
    return authErrorResponse();
  }

  const { id: draftId, secId: sectionId } = await params;

  let body: UpdateSectionBody;
  try {
    body = (await request.json()) as UpdateSectionBody;
  } catch {
    return errorResponse({ code: "invalidInput", message: "Invalid JSON body" }, 400);
  }

  try {
    const draft = await db.draft.findFirst({
      where: { id: draftId, userId: user.id },
      select: { id: true },
    });
    if (!draft) {
      return errorResponse({ code: "draftNotFound", message: "Draft not found" }, 404);
    }

    const section = await db.section.findFirst({
      where: { id: sectionId, draftId },
    });
    if (!section) {
      return errorResponse({ code: "sectionNotFound", message: "Section not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};

    if (body.selectedSource === "a" || body.selectedSource === "b") {
      const sourceContent =
        body.selectedSource === "a" ? section.contentA : section.contentB;
      if (!sourceContent) {
        return errorResponse(
          `Content ${body.selectedSource.toUpperCase()} is not available for selection`,
          400
        );
      }
      const finalContent = stripLeadingSectionTitle(sourceContent, section.title);
      updateData.content = finalContent;
      updateData.selectedModel =
        body.selectedSource === "a" ? section.modelA : section.modelB;
      updateData.wordCount = finalContent.split(/\s+/).filter(Boolean).length;
      updateData.status = "reviewing";
    } else if (body.content !== undefined) {
      updateData.content = body.content;
      updateData.wordCount = body.content.split(/\s+/).filter(Boolean).length;
      updateData.contentA = null;
      updateData.contentB = null;
      updateData.modelA = null;
      updateData.modelB = null;
      updateData.selectedModel = null;
    }

    if (body.constraints !== undefined) {
      updateData.constraints = body.constraints;
    }

    if (body.estimatedWords !== undefined) {
      updateData.estimatedWords = body.estimatedWords;
    }

    const updatedSection = await db.section.update({
      where: { id: sectionId },
      data: updateData,
    });

    return successResponse(updatedSection);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
