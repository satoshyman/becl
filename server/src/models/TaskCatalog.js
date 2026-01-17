import mongoose from 'mongoose';

const TaskCatalogSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    // Emoji/icon shown in UI, e.g. "🎬" "🔗" "📢" "🤖"
    icon: { type: String, default: '✅' },
    // Task kind (used for UI labels and future verification)
    kind: {
      type: String,
      enum: ['timer', 'watch_video', 'external_link', 'join_channel', 'join_bot'],
      default: 'timer'
    },
    // Optional URL for external_link
    url: { type: String, default: '' },
    rewardTon: { type: Number, required: true },
    durationSec: { type: Number, default: 15 },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model('TaskCatalog', TaskCatalogSchema);
