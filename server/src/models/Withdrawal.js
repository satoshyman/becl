import mongoose from 'mongoose';

const WithdrawalSchema = new mongoose.Schema(
  {
    userTelegramId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['TON', 'USDT'], required: true },
    method: { type: String, enum: ['FAUCETPAY_TON', 'BINANCE_USDT_BEP20'], required: true },
    details: {
      faucetPayEmail: { type: String },
      binanceId: { type: String },
      network: { type: String }
    },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'PAID', 'REJECTED'], default: 'PENDING', index: true },
    requestedAt: { type: Date, default: () => new Date(), index: true },
    updatedAt: { type: Date, default: () => new Date() },
    decisionBy: { type: String, default: null },
    decisionAt: { type: Date, default: null },
    rejectReason: { type: String, default: null }
  },
  { timestamps: true }
);

export default mongoose.model('Withdrawal', WithdrawalSchema);
