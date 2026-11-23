import { useEffect, useState } from "react";
import MessageDisplay from "./MessageDisplay";

interface TypingAnimationProps {
  text: string;
  speed?: number; // milliseconds per character
}

export default function TypingAnimation({ text, speed = 20 }: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (displayedText.length < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(text.slice(0, displayedText.length + 1));
      }, speed);

      return () => clearTimeout(timer);
    } else if (displayedText.length === text.length && text.length > 0) {
      setIsComplete(true);
    }
  }, [displayedText, text, speed]);

  return (
    <div>
      <MessageDisplay content={displayedText} role="assistant" />
      {!isComplete && <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse"></span>}
    </div>
  );
}
