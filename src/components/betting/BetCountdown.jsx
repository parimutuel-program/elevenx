import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BetCountdown({ openUntil, className = '', label = 'Betting closes' }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!openUntil) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const endTime = new Date(openUntil).getTime();
      const difference = endTime - now;

      if (difference <= 0) {
        setTimeLeft({ expired: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      // Mark as urgent if less than 1 hour
      setIsUrgent(difference < 1000 * 60 * 60);

      setTimeLeft({ days, hours, minutes, seconds, expired: false });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [openUntil]);

  if (!timeLeft) return null;
  if (timeLeft.expired) {
    return (
      <div className={`flex items-center gap-1.5 text-destructive ${className}`}>
        <Clock className="w-3 h-3" />
        <span className="text-[9px] sm:text-[10px] font-bold">Closed</span>
      </div>
    );
  }

  // Smart display based on time remaining
  const formatTime = () => {
    if (timeLeft.days > 0) {
      return `${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m`;
    } else if (timeLeft.hours > 0) {
      return `${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s`;
    } else if (timeLeft.minutes > 0) {
      return `${timeLeft.minutes}m ${timeLeft.seconds}s`;
    } else {
      return `${timeLeft.seconds}s`;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex items-center gap-1.5 ${isUrgent ? 'text-destructive' : 'text-muted-foreground'} ${className}`}
    >
      <Clock className={`w-3 h-3 ${isUrgent ? 'animate-pulse' : ''}`} />
      <span className="text-[9px] sm:text-[10px] font-bold">{label}:</span>
      <span className="text-[9px] sm:text-[10px] font-bold font-mono">
        {formatTime()}
      </span>
    </motion.div>
  );
}