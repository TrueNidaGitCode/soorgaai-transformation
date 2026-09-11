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
import salesSignalsRoutes from "./routes/salesSignalsRoutes.js";
import outreachPublicRoutes from "./routes/outreachPublicRoutes.js";
import { runOutreachSweep } from "./services/outreachService.js";
import feedbackRoutes               from "./routes/feedbackRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
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
import modelCatalogRoutes           from "./routes/modelCatalogRoutes.js";
import deliveryRoutes               from "./routes/deliveryRoutes.js";
import websiteRoutes                from "./routes/websiteRoutes.js";
import governanceChecklistRoutes    from "./routes/governanceChecklistRoutes.js";
import gatewayRoutes                from "./routes/gatewayRoutes.js";
import billingRoutes                from "./routes/billingRoutes.js";
import { usageContextMiddleware }   from "./services/usageContext.js";
import { attributeRequest, startUsageAccounting } from "./services/usageAttribution.js";

// ✅ Import KB cache warmer
import { warmCache } from "./services/kbRetrievalService.js";
import CompanyBlueprint from "./models/CompanyBlueprint.js";
import TransformationBlueprint from "./models/TransformationBlueprint.js";
import GeneratedApplication from "./models/GeneratedApplication.js";
import { recoverStuckConfluenceSyncs } from "./services/confluenceExtractionService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Railway's proxy — needed so req.ip reflects the real client IP
// (guest rate limiting keys off it) instead of the proxy's address.
app.set('trust proxy', 1);

// ✅ Middleware

/**
 * The global JSON parser, minus the routes that need a bigger body.
 *
 * express.json() defaults to 100 kb, which is right for every ordinary request
 * and far too small for a folder of extracted text or a voice recording. Those
 * routers already declare their own limit — see routes/uploadRoutes.js and
 * routes/guestRoutes.js — but a router-scoped parser can only take effect if
 * nothing has read the stream first.
 *
 * Mounted globally, this ran BEFORE any router and rejected an oversized body
 * itself, so the larger limits below it were unreachable. Folder uploads over
 * 100 kb were failing on that, with a raw HTML PayloadTooLargeError rather than
 * anything the screen could explain.
 *
 * So it steps aside for exactly those paths and lets their own parser run.
 * Raising the global limit instead would widen the body every endpoint on the
 * server accepts, to accommodate two.
 */
const OWN_BODY_LIMIT = [
  /^\/api\/uploads\/(dataset-file|folder)$/,
  /^\/api\/guest\/transcribe$/,
];

const globalJson = express.json();
app.use((req, res, next) => {
  if (OWN_BODY_LIMIT.some(rx => rx.test(req.path))) return next();
  return globalJson(req, res, next);
});

/**
 * Which origins may call this API.
 *
 * FRONTEND_URL is where the product actually lives, and it is already the
 * variable every OAuth redirect is built from — so it belongs here too rather
 * than being restated. The company domain used to be written into this list
 * literally, which made moving to a new one a code change in a file nobody
 * would think to look in while wondering why the site could not reach its API.
 *
 * CORS_EXTRA_ORIGINS covers the cases FRONTEND_URL cannot: a bare apex
 * alongside a www, or an old domain kept alive during a move. Comma separated.
 */
const ALLOWED_ORIGINS = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  // Vercel preview builds, which have a generated hostname per deployment.
  'https://*.vercel.app',
  process.env.FRONTEND_URL,
  ...String(process.env.CORS_EXTRA_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean),
].filter(Boolean);

console.log('[cors] allowed origins: ' + ALLOWED_ORIGINS.join(', '));

app.use(cors({
  origin: ALLOWED_ORIGINS,
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

// Opens the attribution store for this request and everything it starts,
// including the fire-and-forget generation that outlives the response. Must
// come before any route, or the auth middleware has nothing to write into.
app.use(usageContextMiddleware);
// Names the account for the ledger. Separate from authMiddleware because that
// file is copied into every application Eame generates and must not import
// anything only Svarg has — see services/usageAttribution.js.
app.use(attributeRequest);
startUsageAccounting();

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
app.use("/api/admin/sales-signals", salesSignalsRoutes);
// Public on purpose — the unsubscribe link is clicked by non-users.
app.use("/api/outreach", outreachPublicRoutes);
app.use("/api/admin/model-catalog", modelCatalogRoutes);
app.use("/api/billing",              billingRoutes);
app.use("/api/feedback",             feedbackRoutes);
app.use("/api/notifications",        notificationRoutes);
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
//
// `commit` is what this process was actually built from. Without it there is
// no way to tell a deploy that has landed from one still building, and the
// difference is not academic: a fix was diagnosed twice as "not working" while
// the old build was still serving. Railway sets RAILWAY_GIT_COMMIT_SHA itself;
// running locally there is nothing to set it and it reads "local".
const BUILT_FROM = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || 'local';
const STARTED_AT = new Date();

app.get("/", (req, res) => {
    res.status(200).json({
        message: "SoorgaAI Transformation API - Backend is Running!",
        version: "2.1.0",
        product: "Svarg - AI Transformation Platform",
        dynamicRoutes: "enabled",
        commit: BUILT_FROM,
        startedAt: STARTED_AT.toISOString(),
        uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
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

    // ?test=1 runs a minimal real LLM call through the full chain.
    //
    // ?tokens=N varies the ceiling, because 10 stopped being a fair test of
    // whether a provider works. A reasoning model spends its budget thinking
    // before it writes, so a small ceiling returns ok:true with empty text —
    // which reads as "the provider is fine" and is how a chain can run while
    // every short call in the product silently returns nothing. Comparing two
    // ceilings is what tells those apart.
    //
    // Capped, and deliberately low: this route has no `protect` in front of it
    // and every call costs real tokens.
    if (req.query.test === '1') {
        const asked = parseInt(req.query.tokens, 10);
        const maxTokens = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 2000) : 10;
        try {
            const t0 = Date.now();
            const result = await generate({
                systemPrompt: 'You are a test assistant.',
                userMessage:  'Reply with exactly: OK',
                maxTokens,
            });
            const text = result.text || '';
            status.liveTest = {
                ok: true, maxTokens, ms: Date.now() - t0,
                // An empty reply at ok:true is the case worth naming, not hiding.
                chars: text.length,
                empty: text.trim().length === 0,
                preview: text.slice(0, 80),
            };
        } catch (err) {
            status.liveTest = { ok: false, maxTokens, error: err.message };
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
        // An Eame build runs in-process and fire-and-forget, so a deploy in the
        // middle of one kills it and leaves the record saying 'building' with
        // nobody building. startBuild will not start another until the twenty
        // minute staleness window passes, so the customer watches a dead build
        // for twenty minutes and is then told to try again.
        //
        // Any build still marked running at startup is orphaned by definition:
        // this process is the only one that could have owned it, and it did not
        // exist a moment ago. (That reasoning is single-instance; running two
        // of these would need a lock with an owner, not a status field.)
        const buildResult = await GeneratedApplication.updateMany(
            { status: 'building' },
            { $set: {
                status: 'failed',
                reason: 'The server restarted while this build was running, so it was stopped. Nothing was delivered — start it again.',
                'progress.phase': 'failed',
                'progress.detail': 'interrupted by a restart',
                'progress.startedAt': null,
            } }
        );
        if (buildResult.modifiedCount > 0) {
            console.log(`[startup] Recovered ${buildResult.modifiedCount} Eame build(s) interrupted by a restart`);
        }
    } catch (err) {
        console.warn('[startup] Eame build recovery failed (non-fatal):', err.message);
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

/**
 * Whether email can leave this instance.
 *
 * Same reasoning as the LLM banner below: with no transport configured the
 * OTP flow answered "Code sent" and emailed nobody, and the only evidence was
 * a single log line among thousands. This one is at the top and impossible to
 * miss.
 */
async function reportMailConfig() {
    try {
        const { describeMailConfig } = await import('./services/mailService.js');
        const m = describeMailConfig();
        if (m.configured) {
            console.log(`✅ Mail: ${m.transport} as ${m.sender || '(no sender address set)'}`);
            if (!m.sender) console.warn('⚠️  No EMAIL_FROM / EMAIL_USER — Brevo rejects a send with no sender.');
        } else {
            console.warn('⚠️  Mail: NOT CONFIGURED — email sign-in will be refused. Set BREVO_API_KEY and EMAIL_FROM.');
        }
    } catch (err) {
        console.warn(`⚠️  Could not read the mail configuration: ${err.message}`);
    }
}

/**
 * Say which model this instance will actually use, before it uses one.
 *
 * Three environment variables decide it and none of them are visible from
 * outside the container. Printing it once at boot is the difference between
 * "the cloud round ran on Gemini" and assuming it did.
 */
async function reportLlmConfig() {
    try {
        const { describeLlmConfig } = await import('./services/llmService.js');
        const c = describeLlmConfig();
        console.log(`✅ LLM chain: ${c.models.join(' → ')}`);
        if (c.productProvider) {
            console.log(`   Aria/Arth/Eame/Yusu: ${c.productProvider} (PRODUCT_LLM_PROVIDER)`);
        }
        console.log(`   Eame builds with: ${c.eameProvider}`);
        if (c.unkeyed.length) {
            console.warn(`⚠️  No API key for ${c.unkeyed.join(', ')} — failover into ${c.unkeyed.length > 1 ? 'those' : 'that'} would fail rather than degrade.`);
        }
    } catch (err) {
        console.warn(`⚠️  Could not read the LLM configuration: ${err.message}`);
    }
}

/**
 * Follow-up emails go out from a timer, not a request.
 *
 * Every fifteen minutes rather than once a day: a lead becomes due at an
 * arbitrary moment, and a daily tick would send some follow-ups almost a full
 * day late. The sweep itself is cheap — one indexed query that usually returns
 * nothing — and it claims each lead before sending, so a slow run overlapping
 * the next one cannot send the same email twice.
 *
 * Deliberately in-process. A separate worker would be the right answer at
 * volume; at one sender and a handful of leads it would be another thing to
 * deploy, and the failure mode of forgetting to deploy it is silent.
 */
const OUTREACH_SWEEP_MS = 15 * 60 * 1000;

function startOutreachScheduler() {
    if (process.env.OUTREACH_SWEEP_DISABLED === 'true') {
        console.log('[outreach] scheduler disabled by OUTREACH_SWEEP_DISABLED');
        return;
    }
    const tick = () => runOutreachSweep()
        .catch(err => console.error('[outreach] sweep failed (non-fatal):', err.message));

    // Not on the first tick: a restart loop would otherwise fire a sweep on
    // every boot, and a crash-looping server must never become a send loop.
    setInterval(tick, OUTREACH_SWEEP_MS).unref?.();
    console.log(`[outreach] scheduler on, every ${OUTREACH_SWEEP_MS / 60000} min`);
}

// ✅ Connect to MongoDB, then start the server
connectDB()
    .then(async () => {
        await recoverStuckBlueprints();
        warmCache(); // Pre-load KB files into memory
        await reportEmbeddingConfig();
        await reportLlmConfig();
        await reportMailConfig();
        console.log("🚀 Starting SoorgaAI Server...");
        app.listen(PORT, () => console.log(`🚀 SoorgaAI Server running on port ${PORT}`));
        startOutreachScheduler();
    })
    .catch(error => {
        console.error("❌ Server startup failed:", error.message);
    });
