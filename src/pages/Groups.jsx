import React from 'react';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';

const GROUPS = {
  A: [
    { flag: '🇲🇽', name: 'Mexico' },
    { flag: '🇨🇦', name: 'Canada' },
    { flag: '🇺🇸', name: 'USA' },
    { flag: '🇵🇦', name: 'Panama' },
  ],
  B: [
    { flag: '🇦🇷', name: 'Argentina' },
    { flag: '🇵🇾', name: 'Paraguay' },
    { flag: '🇺🇾', name: 'Uruguay' },
    { flag: '🇯🇲', name: 'Jamaica' },
  ],
  C: [
    { flag: '🇧🇷', name: 'Brazil' },
    { flag: '🇨🇴', name: 'Colombia' },
    { flag: '🇵🇪', name: 'Peru' },
    { flag: '🇻🇪', name: 'Venezuela' },
  ],
  D: [
    { flag: '🇬🇧', name: 'England' },
    { flag: '🇳🇱', name: 'Netherlands' },
    { flag: '🇵🇱', name: 'Poland' },
    { flag: '🇲🇦', name: 'Morocco' },
  ],
  E: [
    { flag: '🇪🇸', name: 'Spain' },
    { flag: '🇩🇪', name: 'Germany' },
    { flag: '🇮🇹', name: 'Italy' },
    { flag: '🇩🇬', name: 'Algeria' },
  ],
  F: [
    { flag: '🇫🇷', name: 'France' },
    { flag: '🇵🇹', name: 'Portugal' },
    { flag: '🇸🇪', name: 'Sweden' },
    { flag: '🇧🇬', name: 'Bulgaria' },
  ],
  G: [
    { flag: '🇧🇪', name: 'Belgium' },
    { flag: '🇨🇭', name: 'Switzerland' },
    { flag: '🇦🇹', name: 'Austria' },
    { flag: '🇳🇴', name: 'Norway' },
  ],
  H: [
    { flag: '🇺🇦', name: 'Ukraine' },
    { flag: '🇬🇷', name: 'Greece' },
    { flag: '🇷🇴', name: 'Romania' },
    { flag: '🇧🇪', name: 'Bosnia' },
  ],
};

export default function Groups() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <Layers className="w-6 h-6 text-primary" />
          <h1 className="font-heading font-black text-3xl md:text-4xl">
            World Cup <span className="text-primary">2026 Groups</span>
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">48 Teams · 8 Groups · 12 Teams per Group</p>
      </motion.div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(GROUPS).map(([groupName, teams], groupIndex) => (
          <motion.div
            key={groupName}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.05, duration: 0.4 }}
            className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-all"
          >
            {/* Group Header */}
            <div className="mb-4 pb-3 border-b border-border/30">
              <h2 className="font-heading font-black text-2xl text-primary">Group {groupName}</h2>
            </div>

            {/* Teams List */}
            <div className="space-y-2">
              {teams.map((team, teamIndex) => (
                <motion.div
                  key={team.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: groupIndex * 0.05 + teamIndex * 0.02 }}
                  className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl hover:bg-secondary/50 transition-colors"
                >
                  <span className="text-2xl">{team.flag}</span>
                  <span className="font-medium text-sm text-foreground flex-1">{team.name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-6 text-center"
      >
        <p className="text-foreground font-medium">
          Each group plays a <span className="text-primary font-bold">round-robin tournament</span> — all teams play each other once. The top 2 teams advance to the knockout stage.
        </p>
      </motion.div>
    </div>
  );
}