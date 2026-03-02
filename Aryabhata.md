
# Overview

Aryabhata is a comprehensive UPSC (Union Public Service Commission) preparation platform designed for civil services aspirants. The application provides a complete study experience combining AI-powered tutoring, gamified progress tracking, and detailed analytics.

It supports the full UPSC cycle: Prelims, Mains, Optional subjects, Interview preparation, and Current Affairs. The platform emphasizes a “Prelims-first” approach while offering personalized explanations, adaptive content delivery, progress tracking (badges, streaks, XP), and AI-powered insights.

With a responsive design, Aryabhata works seamlessly across web and mobile platforms.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

Modern React-based architecture with TypeScript:

- **Framework**: React + Vite (fast development and optimized production builds)
- **UI Components**: Shadcn/ui built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom theme system (light/dark modes via CSS variables)
- **State Management**: TanStack Query (React Query) for caching and synchronization
- **Routing**: Wouter for lightweight, fast routing
- **Responsive Design**: Mobile-first with dedicated desktop layouts
- **PWA Support**: Mobile-optimized with bottom navigation, touch gestures, lazy loading

## Backend

RESTful API design with Node.js (Express.js + TypeScript):

- **Runtime**: Node.js with ES modules
- **Authentication**: Multi-provider (local, Google OAuth 2.0, optional Agent auth via OpenID Connect)
- **Session Management**: PostgreSQL-backed (connect-pg-simple) with secure cookies and configurable TTL
- **API Structure**: Modular routes with shared middleware for authentication, error handling, and validation
- **Security**: HTTPS enforcement, CSRF protection, secure headers, and robust input validation

## Database

PostgreSQL with Drizzle ORM (type-safe migrations and queries):

- **User Management**: Profiles with multiple auth providers, streak tracking, XP, and roles
- **Content Hierarchy**: Subjects → Topics → Questions for Prelims, Mains, Optional, Interview
- **Progress Tracking**: User completion %, last activity, and position tracking
- **Gamification**: Badges, streak counters, XP system
- **Analytics**: Quiz attempts, daily stats, performance insights
- **AI Integration**: Cached prompts/responses for cost optimization and offline use
- **Current Affairs**: Structured articles with AI summaries and importance ratings

## Authentication System

- **Local**: Username/email + password (bcrypt hashing)
- **Google OAuth 2.0**: Social login with profile linking
- **Agent Authentication**: Optional OpenID Connect for enterprise/agent users
- **Session Security**: Secure HTTP-only cookies, HTTPS, auto-expiration
- **Account Management**: Seamless provider switching and linking while preserving progress

## AI Integration

Server-side AI (OpenAI GPT models, optional Anthropic fallback):

- **Content Explanations**: AI-powered explanations with difficulty levels and related topics
- **Dynamic Question Generation**: MCQs and quizzes by topic and difficulty
- **Current Affairs Summaries**: AI-generated notes with UPSC relevance scores
- **Caching Strategy**: Database storage of responses to minimize API calls and latency
- **Performance Optimization**: Prompt engineering + intelligent caching for smooth UX
- **Analytics**: Usage tracking for AI responses and learning effectiveness

# External Dependencies

## Core Stack

- Node.js (server runtime)
- Express.js (API framework)
- PostgreSQL (primary database)
- Drizzle ORM (database migrations + type safety)

## Authentication

- Google OAuth 2.0 (social login)
- OpenID Connect (optional enterprise/agent auth)
- Connect-PG-Simple (PostgreSQL session store)
- Bcrypt (secure password hashing)

## AI & ML

- OpenAI API (GPT for content, explanations, and questions)
- Anthropic SDK (optional redundancy)

## Frontend & UI

- Shadcn/ui + Radix UI (accessible components)
- Tailwind CSS (utility-first styling)
- Lucide React (icons)
- React Query (TanStack) (state management)
- Wouter (routing)
- React Hook Form (form validation + handling)

## Dev & Build Tools

- TypeScript (end-to-end type safety)
- Vite + ESBuild (fast builds, optimized bundles)
- Docker (containerized deployments)
- Drizzle Kit (schema migrations)

## Hosting & Deployment

- Neon / Supabase / ElephantSQL (cloud PostgreSQL)
- Dockerized cloud deployment (configurable per environment)
- Environment-based config (for staging, prod, etc.)
- HTTPS/TLS enforced in production
