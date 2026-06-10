import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// ✅ Import routes
import userRoutes              from "./routes/userRoutes.js";
import assessmentRoutes        from "./routes/assessmentRoutes.js";
import dynamicAssessmentRoutes from "./routes/dynamicAssessmentRoutes.js";
import kbRoutes                from "./routes/kbRoutes.js";
import profileRoutes           from "./routes/profileRoutes.js";
import workspaceRoutes         from "./routes/workspaceRoutes.js";
import chatRoutes              from "./routes/chatRoutes.js";
import strategyCanvasRoutes    from "./routes/strategyCanvasRoutes.js";

// ✅ Import KB cache warmer
import { warmCache } from "./services/kbRetrievalService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
app.use("/api/assessment/dynamic",    dynamicAssessmentRoutes);  // ← more specific first
app.use("/api/assessment",            assessmentRoutes);
app.use("/api/kb",                    kbRoutes);                 // Knowledge Base read endpoints
// Workspace routes (v2.2.0 — AI Transformation Workspace)
app.use("/api/profile",               profileRoutes);
app.use("/api/workspace",             workspaceRoutes);
app.use("/api/chat",                  chatRoutes);
app.use("/api/strategy-canvas",       strategyCanvasRoutes);

// ✅ Health Check Route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "SoorgaAI Transformation API - Backend is Running!",
        version: "2.1.0",
        product: "SoorgaAI - AI Maturity Assessment Platform",
        dynamicRoutes: "enabled"
    });
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

// ✅ Connect to MongoDB, then start the server
connectDB()
    .then(() => {
        warmCache(); // Pre-load KB files into memory
        console.log("🚀 Starting SoorgaAI Server...");
        app.listen(PORT, () => console.log(`🚀 SoorgaAI Server running on port ${PORT}`));
    })
    .catch(error => {
        console.error("❌ Server startup failed:", error.message);
    });
