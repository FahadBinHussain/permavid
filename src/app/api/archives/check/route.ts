import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * API endpoint to check if a URL is already archived by another user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, currentUserId } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // Check if the URL exists in the queue with status 'uploaded' (archived)
    // OR any other status for this user
    const archivedItem = await prisma.queueItem.findFirst({
      where: {
        url: url,
        OR: [
          {
            status: "uploaded", // Archived items
            userId: {
              not: currentUserId || undefined,
            },
          },
          {
            status: "uploaded", // Also check current user's own uploads
            userId: currentUserId || undefined,
          },
        ],
      },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (archivedItem) {
      const isOwnArchive = archivedItem.userId === currentUserId;
      return NextResponse.json({
        success: true,
        alreadyArchived: true,
        archivedBy: isOwnArchive
          ? "you"
          : archivedItem.user.displayName || archivedItem.user.username,
        title: archivedItem.title,
        filemoonUrl: archivedItem.filemoonUrl,
        message: isOwnArchive
          ? `You have already archived this URL`
          : `This URL was already archived by ${archivedItem.user.displayName || archivedItem.user.username}`,
      });
    }

    return NextResponse.json({
      success: true,
      alreadyArchived: false,
      message: "URL not yet archived",
    });
  } catch (error) {
    console.error("Error checking archive status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check archive status" },
      { status: 500 }
    );
  }
}
