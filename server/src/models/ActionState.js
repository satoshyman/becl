import mongoose from 'mongoose';

const ActionStateSchema = new mongoose.Schema(
  {
    userTelegramId: { type: String, required: true, index: true },
    type: { type: String, enum: ['mine', 'faucet', 'daily', 'double'], required: true, index: true },
    lastClaimAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ActionStateSchema.index({ userTelegramId: 1, type: 1 }, { unique: true });

export default mongoose.model('ActionState', ActionStateSchema);
