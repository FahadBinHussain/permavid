#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Create a new Prisma Client instance
const prisma = new PrismaClient();

async function initializeDatabase() {
  try {
    console.log('Initializing Neon PostgreSQL database via Prisma...');
    
    // Create default user for local usage
    const localUser = await prisma.user.upsert({
      where: { username: 'local' },
      update: {},
      create: {
        id: 'local-user',
        username: 'local',
        email: 'local@permavid.app',
        displayName: 'Local User',
      },
    });
    console.log('Default local user created or already exists.');

    // Create global settings
    const defaultGlobalSettings = {
      site_name: 'PermaVid Archive',
      max_file_size_mb: 5000,
      allowed_domains: ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com']
    };

    await prisma.setting.upsert({
      where: { key: 'global_settings' },
      update: { value: JSON.stringify(defaultGlobalSettings) },
      create: {
        key: 'global_settings',
        value: JSON.stringify(defaultGlobalSettings),
        userId: null
      }
    });
    console.log('Default global settings initialized.');

    // Initialize default user settings
    const defaultUserSettings = {
      downloadPath: './downloads',
      concurrentDownloads: 2,
      autoDeleteCompleted: false,
      notificationsEnabled: true,
      filemoon_api_key: '',
      files_vc_api_key: '',
      auto_upload: false,
      delete_after_upload: false,
      upload_target: 'none'
    };

    await prisma.setting.upsert({
      where: { key: 'user_settings' },
      update: { value: JSON.stringify(defaultUserSettings) },
      create: {
        key: 'user_settings',
        value: JSON.stringify(defaultUserSettings),
        userId: 'local-user'
      }
    });
    console.log('Default user settings initialized.');

    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the initialization
initializeDatabase(); 