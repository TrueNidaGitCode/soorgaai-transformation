import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// ✅ Import routes
import userRoutes              from "./routes/userRoutes.js";
import oauthRoutes             from "./routes/oauthRoutes.js";
import knowledgeSuggestionRoutes from "./routes/knowledgeSuggestionRoutes.js";
import debugRoutes                  from "./routes/debugRoutes.js"; // TEMPORARY — see controllers/debugController.js
import assessmentRoutes        from "./routes/assessmentRoutes.js";
import dynamicAssessmentRoutes from "./routes/dynamicAssessmentRoutes.js";
import kbRoutes                from "./routes/kbRoutes.js";
import profileRoutes           from "./routes/profileRoutes.js";
import workspaceRoutes         from "./routes/workspaceRoutes.js";
import chatRoutes              from "./routes/chatRoutes.js";
import strategyCanvasRoutes    from "./routes/strategyCanvasRoutes.js";
import companyContextRoutes         from "./routes/companyContextRoutes.js";
import enterpriseBlueprintRoutes    from "./routes/enterpriseBlueprintRoutes.js";
import companyResearchLibraryRoutes from "./routes/companyResearchLibraryRoutes.js";
import industryVerticalKnowledgeRoutes from "./routes/industryVerticalKnowledgeRoutes.js";
import industryCapabilityKnowledgeRoutes from "./routes/industryCapabilityKnowledgeRoutes.js";
import feedbackRoutes               from "./routes/feedbackRoutes.js";
import guestRoutes                  from "./routes/guestRoutes.js";
import confluenceRoutes             from "./routes/confluenceRoutes.js";
import personalConfluenceRoutes     from "./routes/personalConfluenceRoutes.js";
import personalJiraRoutes           from "./routes/personalJiraRoutes.js";
import actionItemRoutes             from "./routes/actionItemRoutes.js";
import contactRoutes                from "./routes/contactRoutes.js";
import defectMatchingRoutes         from "./routes/defectMatchingRoutes.js";
import personalGithubRoutes         from "./routes/personalGithubRoutes.js";
import uploadRoutes                 from "./routes/uploadRoutes.js";
import githubAppRoutes              from "./routes/githubAppRoutes.js";
import deliveryRoutes               from "./routes/deliveryRoutes.js";
import websiteRoutes                from "./routes/websiteRoutes.js";
import governanceChecklistRoutes    from "./routes/governanceChecklistRoutes.js";
import gatewayRoutes                from "./routes/gatewayRoutes.js";

// ✅ Import KB cache warmer
import { warmCache } from "./services/kbRetrievalService.js";
import CompanyBlueprint from "./models/CompanyBlueprint.js";
import TransformationBlueprint from "./models/TransformationBlueprint.js";
import { recoverStuckConfluenceSyncs } from "./services/confluenceExtractionService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Railway's proxy — needed so req.ip reflects the real client IP
// (guest rate limiting keys off it) instead of the proxy's address.
app.set('trust proxy', 1);

// ✅ Middleware
app.use(express.json());

// CORS Configuration - Allow custom domain, Vercel, and local development
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://soorgaai.com',
    'https://www.soorgaai.com',
    'https://*.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ MongoDB Connection Function
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("❌ MongoDB URI is missing in .env file!");
        }

        console.log("🔄 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log("✅ MongoDB Connected Successfully!");
    } catch (error) {
        console.error("❌ MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};

// ✅ Ensure DB is connected before handling requests
app.use(async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        console.log("⚠️ Database not connected. Reconnecting...");
        await connectDB();
    }
    next();
});

// ✅ Register Routes
// NOTE: /api/assessment/dynamic MUST be mounted before /api/assessment
// so Express doesn't swallow dynamic requests under the broader prefix.
app.use("/api/users",                 userRoutes);
app.use("/api/auth/oauth",            oauthRoutes);
app.use("/api/assessment/dynamic",    dynamicAssessmentRoutes);  // ← more specific first
app.use("/api/assessment",            assessmentRoutes);
app.use("/api/kb",                    kbRoutes);                 // Knowledge Base read endpoints
// Workspace routes (v2.2.0 — AI Transformation Workspace)
app.use("/api/profile",               profileRoutes);
app.use("/api/workspace",             workspaceRoutes);
app.use("/api/chat",                  chatRoutes);
app.use("/api/strategy-canvas",       strategyCanvasRoutes);
app.use("/api/company-context",       companyContextRoutes);
app.use("/api/enterprise-blueprint", enterpriseBlueprintRoutes);
app.use("/api/admin/company-library", companyResearchLibraryRoutes);
app.use("/api/admin/industry-verticals", industryVerticalKnowledgeRoutes);
app.use("/api/admin/industry-kb", industryCapabilityKnowledgeRoutes);
app.use("/api/feedback",             feedbackRoutes);
app.use("/api/guest",                guestRoutes);
// More specific prefix first, per the convention noted above
app.use("/api/confluence/personal",  personalConfluenceRoutes);
app.use("/api/confluence",           confluenceRoutes);
app.use("/api/jira/personal",        personalJiraRoutes);
app.use("/api/knowledge-suggestions", knowledgeSuggestionRoutes);
app.use("/api/defect-matching",      defectMatchingRoutes);
app.use("/api/github/personal",      personalGithubRoutes);
app.use("/api/uploads",              uploadRoutes);
// Read-only GitHub App for Aria. Mounted BEFORE /api/github/personal is
// irrelevant (different prefixes) but kept adjacent so the two GitHub
// connections are visibly separate things.
app.use("/api/github/app",           githubAppRoutes);
// Publishing agents to Svarg's own GitHub, and the customer's zip download.
app.use("/api/delivery",             deliveryRoutes);
// The knowledge source every company has — including one with no Confluence.
app.use("/api/website",              websiteRoutes);
// LLM gateway for hosted customer apps. Deployment-token auth, not user JWT.
app.use("/api/gateway/v1",           gatewayRoutes);
app.use("/api/governance-checklist", governanceChecklistRoutes);
app.use("/api/action-items",         actionItemRoutes);
app.use("/api/contact",              contactRoutes);
app.use("/api/debug",                debugRoutes); // TEMPORARY

// ✅ Health Check Route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "SoorgaAI Transformation API - Backend is Running!",
        version: "2.1.0",
        product: "SoorgaAI - AI Maturity Assessment Platform",
        dynamicRoutes: "enabled"
    });
});

// ✅ LLM provider diagnostic — shows which keys are configured + live provider test
import { generate } from "./services/llmService.js";

app.get("/api/llm-status", async (req, res) => {
    const chain = process.env.PROVIDER_CHAIN
        ? process.env.PROVIDER_CHAIN.split(",").map(p => p.trim())
        : process.env.LLM_PROVIDER
            ? [process.env.LLM_PROVIDER]
            : ["gemini", "claude", "openai"];

    const status = {
        providerChain: chain,
        keys: {
            GOOGLE_API_KEY:    !!process.env.GOOGLE_API_KEY,
            GEMINI_API_KEY:    !!process.env.GEMINI_API_KEY,
            ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
            OPENAI_API_KEY:    !!process.env.OPENAI_API_KEY,
        },
        overrides: {
            LLM_PROVIDER:   process.env.LLM_PROVIDER   || null,
            PROVIDER_CHAIN: process.env.PROVIDER_CHAIN || null,
            GEMINI_MODEL:   process.env.GEMINI_MODEL   || null,
            ADVISOR_MODEL:  process.env.ADVISOR_MODEL  || null,
        },
        liveTest: null,
    };

    // ?test=1 runs a minimal real LLM call through the full chain
    if (req.query.test === '1') {
        try {
            const t0 = Date.now();
            const result = await generate({
                systemPrompt: 'You are a test assistant.',
                userMessage:  'Reply with exactly: OK',
                maxTokens:    10,
            });
            status.liveTest = { ok: true, ms: Date.now() - t0, preview: result.text.slice(0, 80) };
        } catch (err) {
            status.liveTest = { ok: false, error: err.message };
        }
    }

    res.json(status);
});

// ✅ Graceful Shutdown
const gracefulShutdown = () => {
    console.log("🔴 Shutting down server... Closing MongoDB connection.");
    mongoose.connection.close(() => {
        console.log("✅ MongoDB Connection Closed.");
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// ── Startup recovery: reset blueprints left in-progress by a previous server crash/deploy
async function recoverStuckBlueprints() {
    try {
        // Reset overall status
        const blueprintResult = await CompanyBlueprint.updateMany(
            { status: 'generating' },
            { $set: { status: 'error', updatedAt: new Date() } }
        );
        // Reset any in-progress capabilities within all blueprints
        const capResult = await CompanyBlueprint.updateMany(
            { 'capabilities.status': 'in-progress' },
            { $set: { 'capabilities.$[cap].status': 'error' } },
            { arrayFilters: [{ 'cap.status': 'in-progress' }] }
        );
        if (blueprintResult.modifiedCount > 0 || capResult.modifiedCount > 0) {
            console.log(`[startup] Recovered ${blueprintResult.modifiedCount} stuck blueprint(s) and ${capResult.modifiedCount} stuck capability doc(s)`);
        }

        // Same recovery for multi-domain TransformationBlueprints (incl. guest
        // previews) — a deploy mid-generation kills the in-process async run,
        // and the SSE/progress UI would otherwise wait on 'generating' forever.
        const tbResult = await TransformationBlueprint.updateMany(
            { status: 'generating' },
            { $set: { status: 'error', updatedAt: new Date() } }
        );
        const tbDomainResult = await TransformationBlueprint.updateMany(
            { 'domains.status': 'generating' },
            { $set: { 'domains.$[dom].status': 'error' } },
            { arrayFilters: [{ 'dom.status': 'generating' }] }
        );
        if (tbResult.modifiedCount > 0 || tbDomainResult.modifiedCount > 0) {
            console.log(`[startup] Recovered ${tbResult.modifiedCount} stuck transformation blueprint(s), ${tbDomainResult.modifiedCount} stuck domain doc(s)`);
        }
    } catch (err) {
        console.warn('[startup] Blueprint recovery failed (non-fatal):', err.message);
    }

    try {
        await recoverStuckConfluenceSyncs();
    } catch (err) {
        console.warn('[startup] Confluence sync recovery failed (non-fatal):', err.message);
    }
}

/**
 * Say which embedding configuration is live, and whether it actually works.
 *
 * Embeddings are the one provider swap that cannot be verified by reading
 * config: the failure mode is a width mismatch or an unreachable endpoint,
 * and both surface as degraded retrieval hours later rather than as an error.
 * One line on boot beats discovering it from a customer's bad search results.
 *
 * Deliberately non-fatal. Semantic retrieval already degrades to the
 * structured arm when embedding fails, so refusing to boot would take the
 * whole product down over a feature that is designed to be optional.
 */
async function reportEmbeddingConfig() {
    try {
        const { verifyEmbeddingConfig } = await import('./services/embeddingService.js');
        const v = await verifyEmbeddingConfig();
        console.log(`✅ Embeddings: ${v.provider}/${v.model} @ ${v.dimensions} dims`);
    } catch (err) {
        console.warn(`⚠️  Embeddings unavailable — semantic retrieval will fall back to structured only: ${err.message}`);
    }
}

// ✅ Connect to MongoDB, then start the server
connectDB()
    .then(async () => {
        await recoverStuckBlueprints();
        warmCache(); // Pre-load KB files into memory
        await reportEmbeddingConfig();
        console.log("🚀 Starting SoorgaAI Server...");
        app.listen(PORT, () => console.log(`🚀 SoorgaAI Server running on port ${PORT}`));
    })
    .catch(error => {
        console.error("❌ Server startup failed:", error.message);
    });
