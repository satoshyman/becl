import mongoose from 'mongoose';

const TaskCompletionSchema = new mongoose.Schema(
  {
    userTelegramId: { type: String, required: true, index: true },
    taskId: { type: String, required: true, index: true },
    completedAt: { type: Date, default: () => new Date(), index: true },
    rewardTon: { type: Number, required: true }
  },
  { timestamps: true }
);

TaskCompletionSchema.index({ userTelegramId: 1, taskId: 1 }, { unique: true });

export default mongoose.model('TaskCompletion', TaskCompletionSchema);
