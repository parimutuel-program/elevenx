import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Clock, DollarSign, TrendingUp, ExternalLink, Zap, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ProtocolVault({ daoBalance, unresolvedStakes, unclaimedWinnings, feeVaultPda }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 flex flex-col justify-between min-h-[320px]"
      style={{ background: '#0F111A', border: '1px solid rgba(153, 69, 255, 0.2)' }}>
      
      {/* Glow effects (Solana Purple & Green) */}
      <div className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl opacity-20" style={{ background: '#a69cf2' }} />
      <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full blur-3xl opacity-15" style={{ background: '#14f195' }} />
      
      <div className="relative z-10">
        {/* Brand Title */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Protocol Vault</span>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">
            ON-CHAIN LIVE
          </Badge>
        </div>

        <h2 className="font-heading font-black text-xl sm:text-2xl text-white leading-tight mb-5">
          Treasury Ledger
        </h2>

        {/* Live Stats Grid */}
        <div className="space-y-3">
          {/* 1. Protocol Fees (Treasury Balance) */}
          <div className="group bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm rounded-xl p-3.5 border border-emerald-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-[9px] text-white/40 uppercase tracking-widest">Protocol Fees</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-heading font-black text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                ◎{daoBalance.toFixed(4)}
              </span>
              <span className="text-xs text-emerald-400/60 font-medium">SOL</span>
            </div>
          </div>

          {/* 2. Locked in Pools (Unresolved Stakes) */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <p className="text-[9px] text-white/40 uppercase tracking-widest">Locked in Pools</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-heading font-bold text-yellow-400">◎{unresolvedStakes.toFixed(4)}</span>
              <span className="text-[10px] text-yellow-400/60">active stakes</span>
            </div>
          </div>

          {/* 3. Pending Claims (Unclaimed Winnings) */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <p className="text-[9px] text-white/40 uppercase tracking-widest">Pending Claims</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-heading font-bold text-purple-400">◎{unclaimedWinnings.toFixed(4)}</span>
              <span className="text-[10px] text-purple-400/60">awaiting withdrawal</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with Vault Info */}
      <div className="relative z-10 mt-5 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3 text-white/30" />
            <span className="text-[9px] text-white/40 font-mono">
              {feeVaultPda ? `${feeVaultPda.slice(0, 6)}...${feeVaultPda.slice(-4)}` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[9px] text-emerald-400">
              <Zap className="w-2.5 h-2.5" />
              <span className="font-bold">LIVE FEED</span>
            </div>
            {feeVaultPda && (
              <a
                href={`https://solscan.io/account/${feeVaultPda}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[9px] text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
                <ExternalLink className="w-2.5 h-2.5" />
                Verify
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}