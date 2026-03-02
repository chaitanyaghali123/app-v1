import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  decimal,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Agent Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (supports Agent Auth, Google OAuth, and local auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(),
  password: varchar("password"),
  email: varchar("email").unique(),
  first_name: varchar("first_name"),
  last_name: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  authProvider: varchar("auth_provider").default("local"), // 'agent', 'google', 'local'
  googleId: varchar("google_id"),
  agentId: varchar("agent_id"),
  optionalSubject: varchar("optional_subject"),
  currentStreak: integer("current_streak").default(0),
  totalXp: integer("total_xp").default(0),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subjects table
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  type: varchar("type").notNull(), // prelims, mains, optional, interview
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Topics table
export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectId: varchar("subject_id").references(() => subjects.id),
  title: varchar("title").notNull(),
  content: text("content"),
  parentTopicId: varchar("parent_topic_id"),
  difficultyLevel: integer("difficulty_level").default(1),
  metadata: jsonb("metadata"),
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// MCQ Questions table
export const mcqQuestions = pgTable("mcq_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => topics.id),
  questionText: text("question_text").notNull(),
  options: jsonb("options").notNull(), // Array of options
  correctOption: integer("correct_option").notNull(),
  explanation: text("explanation"),
  difficultyLevel: integer("difficulty_level").default(1),
  tags: jsonb("tags"), // Array of tags
  createdAt: timestamp("created_at").defaultNow(),
});

// User progress table
export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  topicId: varchar("topic_id").references(() => topics.id),
  section: varchar("section").notNull(), // prelims, mains, optional, interview
  lastPosition: text("last_position"), // JSON string for complex position data
  progressPercentage: decimal("progress_percentage").default("0"),
  timeSpent: integer("time_spent").default(0), // in seconds
  lastAccessed: timestamp("last_accessed").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quiz attempts table
export const quizAttempts = pgTable("quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  questionId: varchar("question_id").references(() => mcqQuestions.id),
  selectedOption: integer("selected_option").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  timeTaken: integer("time_taken"), // in seconds
  createdAt: timestamp("created_at").defaultNow(),
});

// Current affairs table
export const currentAffairs = pgTable("current_affairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  content: text("content"),
  sourceUrl: varchar("source_url"),
  subjectTags: jsonb("subject_tags"), // Array of subject tags
  aiSummary: text("ai_summary"),
  importance: integer("importance").default(1), // 1-5 scale
  dateOccurred: timestamp("date_occurred"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI prompts and responses table
export const aiPrompts = pgTable("ai_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  section: varchar("section"), // prelims, mains, optional, interview, current_affairs
  subjectId: varchar("subject_id").references(() => subjects.id),
  promptText: text("prompt_text").notNull(),
  responseText: text("response_text"),
  promptType: varchar("prompt_type"), // explanation, summary, quiz_generation
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Badges table
export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon").notNull(),
  criteria: jsonb("criteria").notNull(),
  xpReward: integer("xp_reward").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// User badges table
export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  badgeId: varchar("badge_id").references(() => badges.id),
  earnedAt: timestamp("earned_at").defaultNow(),
});

// Analytics events table
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  eventType: varchar("event_type").notNull(),
  eventData: jsonb("event_data"),
  sessionId: varchar("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily stats table
export const dailyStats = pgTable("daily_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  date: timestamp("date").notNull(),
  questionsAnswered: integer("questions_answered").default(0),
  correctAnswers: integer("correct_answers").default(0),
  accuracy: decimal("accuracy").default("0"),
  xpEarned: integer("xp_earned").default(0),
  timeSpent: integer("time_spent").default(0), // in seconds
  createdAt: timestamp("created_at").defaultNow(),
});

// Study sessions table - Track individual study sessions
export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionType: varchar("session_type").notNull(), // reading, quiz, practice, review
  subjectId: varchar("subject_id").references(() => subjects.id),
  topicId: varchar("topic_id").references(() => topics.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in seconds
  questionsAttempted: integer("questions_attempted").default(0),
  questionsCorrect: integer("questions_correct").default(0),
  xpEarned: integer("xp_earned").default(0),
  notes: text("notes"),
  metadata: jsonb("metadata"), // Additional session data
  createdAt: timestamp("created_at").defaultNow(),
});

// User learning goals table
export const learningGoals = pgTable("learning_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  goalType: varchar("goal_type").notNull(), // daily, weekly, monthly, exam_based, topic_mastery
  targetValue: integer("target_value"), // Target number (questions, hours, topics)
  currentProgress: integer("current_progress").default(0),
  targetDate: timestamp("target_date"),
  subjectId: varchar("subject_id").references(() => subjects.id),
  topicId: varchar("topic_id").references(() => topics.id),
  priority: integer("priority").default(1), // 1-5 scale
  status: varchar("status").default("active"), // active, completed, paused, cancelled
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User preferences and settings table
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).unique(),
  studyReminders: boolean("study_reminders").default(true),
  reminderTime: varchar("reminder_time"), // HH:MM format
  preferredDifficulty: integer("preferred_difficulty").default(2), // 1-5 scale
  dailyStudyTarget: integer("daily_study_target").default(60), // minutes
  weeklyStudyTarget: integer("weekly_study_target").default(420), // minutes
  notificationSettings: jsonb("notification_settings"),
  uiPreferences: jsonb("ui_preferences"), // theme, layout preferences
  studySchedule: jsonb("study_schedule"), // Weekly schedule preferences
  autoAdvance: boolean("auto_advance").default(true),
  showExplanations: boolean("show_explanations").default(true),
  spacedRepetition: boolean("spaced_repetition").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bookmarks/Favorites table
export const userBookmarks = pgTable("user_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  itemType: varchar("item_type").notNull(), // topic, question, current_affair, note
  itemId: varchar("item_id").notNull(), // ID of the bookmarked item
  title: varchar("title"),
  tags: jsonb("tags"), // User-defined tags
  notes: text("notes"), // User notes on the bookmark
  createdAt: timestamp("created_at").defaultNow(),
});

// User notes table
export const userNotes = pgTable("user_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  noteType: varchar("note_type").default("general"), // general, topic_summary, question_note, formula
  subjectId: varchar("subject_id").references(() => subjects.id),
  topicId: varchar("topic_id").references(() => topics.id),
  questionId: varchar("question_id").references(() => mcqQuestions.id),
  tags: jsonb("tags"),
  isPublic: boolean("is_public").default(false),
  lastEdited: timestamp("last_edited").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reading history table - Track what content user has accessed
export const readingHistory = pgTable("reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  contentType: varchar("content_type").notNull(), // topic, current_affair, explanation
  contentId: varchar("content_id").notNull(),
  title: varchar("title"),
  timeSpent: integer("time_spent"), // seconds
  progressPercentage: integer("progress_percentage").default(0), // 0-100
  completedAt: timestamp("completed_at"),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
  accessCount: integer("access_count").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Performance analytics table - Detailed performance tracking
export const performanceAnalytics = pgTable("performance_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  subjectId: varchar("subject_id").references(() => subjects.id),
  topicId: varchar("topic_id").references(() => topics.id),
  period: varchar("period").notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  questionsAttempted: integer("questions_attempted").default(0),
  questionsCorrect: integer("questions_correct").default(0),
  averageTimePerQuestion: decimal("avg_time_per_question"), // seconds
  strongestAreas: jsonb("strongest_areas"), // Topic IDs with high performance
  weakestAreas: jsonb("weakest_areas"), // Topic IDs with low performance
  improvementAreas: jsonb("improvement_areas"), // Suggested focus areas
  totalTimeSpent: integer("total_time_spent").default(0), // seconds
  streakDays: integer("streak_days").default(0),
  xpEarned: integer("xp_earned").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Review schedule table - Spaced repetition system
export const reviewSchedule = pgTable("review_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  itemType: varchar("item_type").notNull(), // topic, question, note
  itemId: varchar("item_id").notNull(),
  nextReviewDate: timestamp("next_review_date").notNull(),
  difficultyLevel: integer("difficulty_level").default(1), // 1-5, affects review frequency
  reviewCount: integer("review_count").default(0),
  lastReviewedAt: timestamp("last_reviewed_at"),
  masteryLevel: integer("mastery_level").default(1), // 1-5, how well user knows the content
  reviewInterval: integer("review_interval").default(1), // days until next review
  priority: integer("priority").default(1), // 1-5, higher priority items reviewed first
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Study plan table - Structured learning paths
export const studyPlans = pgTable("study_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  examType: varchar("exam_type"), // prelims, mains, optional, interview
  targetDate: timestamp("target_date"),
  totalDuration: integer("total_duration"), // estimated hours
  subjects: jsonb("subjects"), // Array of subject IDs included
  schedule: jsonb("schedule"), // Detailed day-by-day schedule
  currentWeek: integer("current_week").default(1),
  currentDay: integer("current_day").default(1),
  progress: decimal("progress").default("0"), // 0-100
  status: varchar("status").default("active"), // active, completed, paused
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  progress: many(userProgress),
  quizAttempts: many(quizAttempts),
  aiPrompts: many(aiPrompts),
  badges: many(userBadges),
  analyticsEvents: many(analyticsEvents),
  dailyStats: many(dailyStats),
  studySessions: many(studySessions),
  learningGoals: many(learningGoals),
  preferences: one(userPreferences),
  bookmarks: many(userBookmarks),
  notes: many(userNotes),
  readingHistory: many(readingHistory),
  performanceAnalytics: many(performanceAnalytics),
  reviewSchedule: many(reviewSchedule),
  studyPlans: many(studyPlans),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  topics: many(topics),
  aiPrompts: many(aiPrompts),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [topics.subjectId],
    references: [subjects.id],
  }),
  parentTopic: one(topics, {
    fields: [topics.parentTopicId],
    references: [topics.id],
  }),
  subTopics: many(topics),
  questions: many(mcqQuestions),
  progress: many(userProgress),
}));

export const mcqQuestionsRelations = relations(mcqQuestions, ({ one, many }) => ({
  topic: one(topics, {
    fields: [mcqQuestions.topicId],
    references: [topics.id],
  }),
  attempts: many(quizAttempts),
  notes: many(userNotes),
}));

// New table relations
export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  user: one(users, {
    fields: [studySessions.userId],
    references: [users.id],
  }),
  subject: one(subjects, {
    fields: [studySessions.subjectId],
    references: [subjects.id],
  }),
  topic: one(topics, {
    fields: [studySessions.topicId],
    references: [topics.id],
  }),
}));

export const learningGoalsRelations = relations(learningGoals, ({ one }) => ({
  user: one(users, {
    fields: [learningGoals.userId],
    references: [users.id],
  }),
  subject: one(subjects, {
    fields: [learningGoals.subjectId],
    references: [subjects.id],
  }),
  topic: one(topics, {
    fields: [learningGoals.topicId],
    references: [topics.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const userBookmarksRelations = relations(userBookmarks, ({ one }) => ({
  user: one(users, {
    fields: [userBookmarks.userId],
    references: [users.id],
  }),
}));

export const userNotesRelations = relations(userNotes, ({ one }) => ({
  user: one(users, {
    fields: [userNotes.userId],
    references: [users.id],
  }),
  subject: one(subjects, {
    fields: [userNotes.subjectId],
    references: [subjects.id],
  }),
  topic: one(topics, {
    fields: [userNotes.topicId],
    references: [topics.id],
  }),
  question: one(mcqQuestions, {
    fields: [userNotes.questionId],
    references: [mcqQuestions.id],
  }),
}));

export const readingHistoryRelations = relations(readingHistory, ({ one }) => ({
  user: one(users, {
    fields: [readingHistory.userId],
    references: [users.id],
  }),
}));

export const performanceAnalyticsRelations = relations(performanceAnalytics, ({ one }) => ({
  user: one(users, {
    fields: [performanceAnalytics.userId],
    references: [users.id],
  }),
  subject: one(subjects, {
    fields: [performanceAnalytics.subjectId],
    references: [subjects.id],
  }),
  topic: one(topics, {
    fields: [performanceAnalytics.topicId],
    references: [topics.id],
  }),
}));

export const reviewScheduleRelations = relations(reviewSchedule, ({ one }) => ({
  user: one(users, {
    fields: [reviewSchedule.userId],
    references: [users.id],
  }),
}));

export const studyPlansRelations = relations(studyPlans, ({ one }) => ({
  user: one(users, {
    fields: [studyPlans.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  first_name: true,
  last_name: true,
  profileImageUrl: true,
  authProvider: true,
  googleId: true,
  agentId: true,
  optionalSubject: true,
});

export const insertLocalUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  first_name: true,
  last_name: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
});

export const insertTopicSchema = createInsertSchema(topics).omit({
  id: true,
  createdAt: true,
});

export const insertMcqQuestionSchema = createInsertSchema(mcqQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  updatedAt: true,
});

export const insertQuizAttemptSchema = createInsertSchema(quizAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertCurrentAffairsSchema = createInsertSchema(currentAffairs).omit({
  id: true,
  createdAt: true,
});

export const insertAiPromptSchema = createInsertSchema(aiPrompts).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({
  id: true,
  createdAt: true,
});

// New table insert schemas
export const insertStudySessionSchema = createInsertSchema(studySessions).omit({
  id: true,
  createdAt: true,
});

export const insertLearningGoalSchema = createInsertSchema(learningGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserBookmarkSchema = createInsertSchema(userBookmarks).omit({
  id: true,
  createdAt: true,
});

export const insertUserNoteSchema = createInsertSchema(userNotes).omit({
  id: true,
  createdAt: true,
  lastEdited: true,
});

export const insertReadingHistorySchema = createInsertSchema(readingHistory).omit({
  id: true,
  createdAt: true,
  lastAccessedAt: true,
});

export const insertPerformanceAnalyticsSchema = createInsertSchema(performanceAnalytics).omit({
  id: true,
  createdAt: true,
});

export const insertReviewScheduleSchema = createInsertSchema(reviewSchedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudyPlanSchema = createInsertSchema(studyPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type CreateLocalUser = z.infer<typeof insertLocalUserSchema>;
export type LoginUser = z.infer<typeof loginSchema>;
export type SignupUser = z.infer<typeof signupSchema>;
export type User = typeof users.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type McqQuestion = typeof mcqQuestions.$inferSelect;
export type UserProgress = typeof userProgress.$inferSelect;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type CurrentAffairs = typeof currentAffairs.$inferSelect;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type DailyStats = typeof dailyStats.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type LearningGoal = typeof learningGoals.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type UserBookmark = typeof userBookmarks.$inferSelect;
export type UserNote = typeof userNotes.$inferSelect;
export type ReadingHistory = typeof readingHistory.$inferSelect;
export type PerformanceAnalytics = typeof performanceAnalytics.$inferSelect;
export type ReviewSchedule = typeof reviewSchedule.$inferSelect;
export type StudyPlan = typeof studyPlans.$inferSelect;

export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type InsertMcqQuestion = z.infer<typeof insertMcqQuestionSchema>;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;
export type InsertCurrentAffairs = z.infer<typeof insertCurrentAffairsSchema>;
export type InsertAiPrompt = z.infer<typeof insertAiPromptSchema>;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type InsertDailyStats = z.infer<typeof insertDailyStatsSchema>;
export type InsertStudySession = z.infer<typeof insertStudySessionSchema>;
export type InsertLearningGoal = z.infer<typeof insertLearningGoalSchema>;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type InsertUserBookmark = z.infer<typeof insertUserBookmarkSchema>;
export type InsertUserNote = z.infer<typeof insertUserNoteSchema>;
export type InsertReadingHistory = z.infer<typeof insertReadingHistorySchema>;
export type InsertPerformanceAnalytics = z.infer<typeof insertPerformanceAnalyticsSchema>;
export type InsertReviewSchedule = z.infer<typeof insertReviewScheduleSchema>;
export type InsertStudyPlan = z.infer<typeof insertStudyPlanSchema>;
