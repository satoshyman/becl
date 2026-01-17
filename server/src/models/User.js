import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },
    balance: { type: Number, default: 0 },
    lockedBalance: { type: Number, default: 0 },
    friendsCount: { type: Number, default: 0 },
    refEarned: { type: Number, default: 0 },
    referrerTelegramId: { type: String, default: null },
    refApplied: { type: Boolean, default: false },
    joinedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
