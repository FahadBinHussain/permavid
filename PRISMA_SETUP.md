# Prisma with Neon Database Setup Guide

This guide explains how to set up and use the Prisma ORM with Neon PostgreSQL for PermaVid.

## Database Architecture

PermaVid uses a global database approach where:
- All archived videos are stored in a single global database
- All users can see all archived videos in the gallery
- User information is stored for attribution purposes only

## Prerequisites

- Neon account (create one at [console.neon.tech](https://console.neon.tech) if you don't have one)
- Node.js and pnpm installed

## Setup Instructions

### 1. Create a Neon Project

1. Sign up or log in to [Neon](https://console.neon.tech)
2. Create a new project
3. After project creation, go to the "Connection Details" tab
4. Copy the provided connection string that looks like:
   ```
   postgresql://neondb_owner:password@ep-something-id-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Configure Environment Variables

1. Create or edit the `.env` file in the root of your project
2. Add your Neon connection string:
   ```
   NEON_DATABASE_URL=postgresql://neondb_owner:password@ep-something-id-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

### 3. Initialize the Database

Run the following command to initialize the database schema and create initial data:

```bash
pnpm db:init
```

## Development Workflows

### Push Schema Changes

When you make changes to the Prisma schema in `prisma/schema.prisma`, push those changes to the database:

```bash
pnpm prisma:push
```

### Regenerate Prisma Client

After schema changes, regenerate the Prisma Client:

```bash
pnpm prisma:generate
```

### Explore Your Database

Use Prisma Studio to view and edit your database visually:

```bash
pnpm prisma:studio
```

## Common Issues

### Connection Problems

If you encounter connection issues:

1. Check if your connection string is correct in `.env`
2. Make sure your IP is allowed in Neon's IP access rules
3. Verify that you have an active internet connection

### Schema Push Errors

If you get errors when pushing schema changes:

1. Check your Prisma schema for syntax errors
2. Make sure any required fields have proper defaults
3. For complex schema changes, consider using migrations instead of direct pushes 