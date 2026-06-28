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
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // OAuth fields
    authProvider:   { type: String, enum: ['local', 'google', 'microsoft'], default: 'local' },
    providerUserId: { type: String },
    profileImage:   { type: String },
    emailVerified:  { type: Boolean, default: false },
}, { timestamps: true });

export const User = mongoose.model("User", UserSchema); // ✅ Named Export
