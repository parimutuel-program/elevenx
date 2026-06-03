import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function EmptyState({ message, actionText, link }) {
  return (
    <div className="text-center py-12 bg-card border border-border/50 rounded-2xl">
      <p className="text-muted-foreground mb-4">{message}</p>
      {link && (
        <Link to={link}>
          <Button className="gap-2 rounded-xl">
            {actionText}
          </Button>
        </Link>
      )}
    </div>
  );
}