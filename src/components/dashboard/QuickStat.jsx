import React from 'react';

export default function QuickStat({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="font-heading font-bold text-lg">{value}</p>
      </div>
    </div>
  );
}