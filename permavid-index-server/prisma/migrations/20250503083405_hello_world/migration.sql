-- CreateTable
CREATE TABLE "ArchivedIdentifier" (
    "id" TEXT NOT NULL,
    "canonicalIdentifier" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedIdentifier_canonicalIdentifier_key" ON "ArchivedIdentifier"("canonicalIdentifier");
