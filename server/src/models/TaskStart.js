import mongoose from 'mongoose';

const TaskStartSchema = new mongoose.Schema(
  {
    userTelegramId: { type: String, required: true, index: true },
    taskId: { type: String, required: true, index: true },
    startedAt: { type: Date, default: () => new Date(), index: true }
  },
  { timestamps: true }
);

TaskStartSchema.index({ userTelegramId: 1, taskId: 1 }, { unique: true });

export default mongoose.model('TaskStart', TaskStartSchema);
