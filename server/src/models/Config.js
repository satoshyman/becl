import mongoose from 'mongoose';

const ConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    // Admin-controlled settings (editable from hidden bot panel)
    money: {
      // Cooldowns for cards (seconds)
      cooldowns: {
        mineSec: { type: Number, default: 300 },
        faucetSec: { type: Number, default: 300 }
      },
      // How much time to reduce when user taps "speed up" (seconds)
      speedUpSec: { type: Number, default: 120 }
    },
    rewards: {
      mine: { type: Number, default: 0.00001 },
      faucet: { type: Number, default: 0.00001 },
      daily: { type: Number, default: 0.0001 }
    },
    limits: {
      minWithdrawTon: { type: Number, default: 0.0001 },
      minWithdrawUsdt: { type: Number, default: 0.5 }
    },
    withdraw: {
      enabledMethods: {
        faucetpayTon: { type: Boolean, default: true },
        binanceUsdtBep20: { type: Boolean, default: true }
      }
    },
    referral: {
      bonusTon: { type: Number, default: 0.002 }
    },
    tasks: {
      defaultDurationSec: { type: Number, default: 15 }
    },
    ads: {
      mine: { type: String, default: "#" },
      faucet: { type: String, default: "#" },
      daily: { type: String, default: "#" },
      double: { type: String, default: "#" }
    },
    // Optional ad scripts (JS snippets) executed before starting each card
    adsScripts: {
      mine: { type: String, default: "" },
      faucet: { type: String, default: "" },
      daily: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Config', ConfigSchema);
