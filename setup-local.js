#!/usr/bin/env node

/**
 * Local Development Setup Script for Aryabhata UPSC Platform
 * 
 * This script helps set up the project for local development by:
 * 1. Creating .env file from example
 * 2. Checking PostgreSQL connection
 * 3. Setting up database schema
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Aryabhata for local development...\n');

// Step 1: Create .env file if it doesn't exist
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ Created .env file from .env.example');
    console.log('📝 Please edit .env file with your database credentials and other settings\n');
  } else {
    console.log('⚠️  .env.example not found. Please create .env file manually.\n');
  }
} else {
  console.log('✅ .env file already exists\n');
}

// Step 2: Install dependencies
console.log('📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Dependencies installed\n');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Step 3: Setup database schema
console.log('🗄️  Setting up database schema...');
try {
  execSync('npm run db:push', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Database schema created successfully\n');
} catch (error) {
  console.log('⚠️  Database setup failed. This is normal if PostgreSQL is not running.');
  console.log('Please ensure PostgreSQL is installed and running, then run: npm run db:push\n');
}

console.log('🎉 Setup completed!');
console.log('\n📋 Next steps:');
console.log('1. Make sure PostgreSQL is installed and running');
console.log('2. Update your .env file with correct database URL');
console.log('3. Run "npm run db:push" to create database tables');
console.log('4. Run "npm run dev" to start the development server');
console.log('\n🌐 Your app will be available at http://localhost:5000');