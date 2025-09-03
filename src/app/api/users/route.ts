import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, email, image } = body;

    if (!id || !email) {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (existingUser) {
      // Update existing user's last login
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          displayName: name || existingUser.displayName,
          lastLogin: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: "User updated successfully",
      });
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        id,
        username: email, // Use email as username for Google auth users
        email,
        displayName: name,
        lastLogin: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      user: newUser,
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Error creating/updating user:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");
    const email = searchParams.get("email");

    if (!userId && !email) {
      return NextResponse.json(
        { error: "User ID or email is required" },
        { status: 400 },
      );
    }

    let user;
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      });
    } else if (email) {
      user = await prisma.user.findUnique({
        where: { email },
      });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
