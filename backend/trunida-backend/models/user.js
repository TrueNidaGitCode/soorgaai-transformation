import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // optional for OAuth users
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    /**
     * real | internal | test — or empty, meaning "infer it".
     *
     * Set by an admin from the sales funnel when the guess is wrong. No
     * heuristic can know that a gmail address belongs to the founder, or that
     * a colleague's work address at a former employer is not a prospect, so
     * the inference proposes and this decides. Empty is the normal state.
     *
     * Never gates access to anything — it only decides which rows a sales
     * board shows by default. See services/accountKindService.js.
     */
    accountKind: {
        type: String,
        enum: ['', 'real', 'internal', 'test'],
        default: '',
    },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // OAuth fields
    authProvider:   { type: String, enum: ['local', 'google', 'microsoft'], default: 'local' },
    providerUserId: { type: String },
    profileImage:   { type: String },
    emailVerified:  { type: Boolean, default: false },
    /**
     * When this account was last actually here.
     *
     * Written by the auth middleware, throttled to an hour. Absent means
     * either a brand-new account or one that predates this field, and the
     * two cannot be told apart — which is why nothing treats absence as
     * evidence that somebody never returned.
     */
    lastSeenAt: { type: Date, default: null, index: true },
}, { timestamps: true });

export const User = mongoose.model("User", UserSchema); // ✅ Named Export
