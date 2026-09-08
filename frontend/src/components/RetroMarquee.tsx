import React, { useState, useEffect } from 'react';

interface RetroMarqueeProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export const RetroMarquee: React.FC<RetroMarqueeProps> = ({ text, maxLength = 20, className = '' }) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (text.length <= maxLength) {
      setOffset(0);
      return;
    }

    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (text.length + 5)); // +5 for the spacer
    }, 500); // 500ms for a more readable terminal step

    return () => clearInterval(interval);
  }, [text, maxLength]);

  if (text.length <= maxLength) {
    return <div className={className}>{text}</div>;
  }

  const spacer = " /// ";
  const paddedText = text + spacer;
  
  // Create a continuous looping string
  let display = paddedText.slice(offset) + paddedText.slice(0, offset);
  display = display.slice(0, maxLength); // Trim to exact length so it doesn't push layout

  return (
    <div className={`${className} font-mono whitespace-pre`}>
      {display}
    </div>
  );
};
