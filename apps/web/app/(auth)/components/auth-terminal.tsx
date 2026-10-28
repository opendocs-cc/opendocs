"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { instanceHost } from "@opendocs/shared/config/instance";

type Line = {
  type: "cmd" | "success" | "comment" | "muted" | "blank";
  text?: string;
};

const SCRIPT: Line[] = [
  { type: "cmd", text: "opendocs publish arch-decision.md" },
  { type: "success", text: `${instanceHost()}/acme/arch-decision` },
  { type: "comment", text: "# your team can stop asking 'where's the doc?'" },
  { type: "blank" },
  { type: "cmd", text: "opendocs export q4-review -f pdf" },
  { type: "success", text: "Saved to ./q4-review.pdf" },
  { type: "comment", text: "# now it looks like you planned this all along" },
  { type: "blank" },
  { type: "cmd", text: "opendocs publish incident-report.md" },
  { type: "success", text: `${instanceHost()}/acme/incident-report` },
  { type: "comment", text: "# it was DNS. it's always DNS." },
  { type: "blank" },
  { type: "cmd", text: "opendocs publish friday-deploy-notes.md" },
  { type: "success", text: `${instanceHost()}/acme/friday-deploy-notes` },
  { type: "comment", text: "# YOLO" },
];

const DELAYS: Record<Line["type"], number> = {
  cmd: 900,
  success: 500,
  comment: 600,
  muted: 400,
  blank: 700,
};

export function AuthTerminal() {
  // Index of the line we're currently processing (-1 = haven't started)
  const [activeIndex, setActiveIndex] = useState(-1);
  // Lines that have been fully revealed (including typed commands)
  const [revealed, setRevealed] = useState<Line[]>([]);
  // Current typing state
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start the animation
  useEffect(() => {
    const t = setTimeout(() => setActiveIndex(0), 400);
    return () => clearTimeout(t);
  }, []);

  // Process each line as activeIndex advances
  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= SCRIPT.length) {
      if (activeIndex >= SCRIPT.length) setDone(true);
      return;
    }

    const line = SCRIPT[activeIndex];
    if (!line) return;

    if (line.type === "cmd" && line.text) {
      // Type the command character by character
      setIsTyping(true);
      setTypedText("");
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setTypedText(line.text!.slice(0, i));
        if (i >= line.text!.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsTyping(false);
          // Move this command into revealed immediately (no animation)
          setRevealed((prev) => [...prev, line]);
          setTypedText("");
          // Advance after a short pause
          setTimeout(() => setActiveIndex((idx) => idx + 1), 300);
        }
      }, 35);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    // Non-command lines: reveal after delay
    const t = setTimeout(() => {
      setRevealed((prev) => [...prev, line]);
      setActiveIndex((idx) => idx + 1);
    }, DELAYS[line.type]);

    return () => clearTimeout(t);
  }, [activeIndex]);

  return (
    <div className="auth-terminal">
      <div className="auth-terminal__bar">
        <div className="auth-terminal__dot auth-terminal__dot--red" />
        <div className="auth-terminal__dot auth-terminal__dot--yellow" />
        <div className="auth-terminal__dot auth-terminal__dot--green" />
        <span className="auth-terminal__title">~</span>
      </div>
      <div className="auth-terminal__body">
        {/* Already revealed lines */}
        {revealed.map((line, i) => {
          // Commands were typed live — render them without fade animation
          const animClass = line.type === "cmd" ? "" : "auth-terminal__fade-in";
          return (
            <div
              key={i}
              className={`auth-terminal__line auth-terminal__line--${line.type} ${animClass}`}
            >
              {line.type === "cmd" && (
                <>
                  <span className="auth-terminal__arrow">➜</span>{" "}
                  <span className="auth-terminal__cmd-text">{line.text}</span>
                </>
              )}
              {line.type === "success" && (
                <>
                  <span className="auth-terminal__check">✔</span> {line.text}
                </>
              )}
              {line.type === "comment" && line.text}
              {line.type === "muted" && line.text}
              {line.type === "blank" && "\u00A0"}
            </div>
          );
        })}

        {/* Currently typing line */}
        {isTyping && (
          <div className="auth-terminal__line auth-terminal__line--cmd">
            <span className="auth-terminal__arrow">➜</span>{" "}
            <span className="auth-terminal__cmd-text">
              {typedText}
              <span className="auth-terminal__cursor" />
            </span>
          </div>
        )}

        {/* Idle cursor between command blocks */}
        {!isTyping && !done && activeIndex > 0 && activeIndex < SCRIPT.length && SCRIPT[activeIndex]?.type === "cmd" && (
          <div className="auth-terminal__line auth-terminal__line--cmd">
            <span className="auth-terminal__arrow">➜</span>{" "}
            <span className="auth-terminal__cursor" />
          </div>
        )}

        {/* Final blinking cursor */}
        {done && (
          <div className="auth-terminal__line auth-terminal__line--cmd auth-terminal__fade-in">
            <span className="auth-terminal__arrow">➜</span>{" "}
            <span className="auth-terminal__cursor" />
          </div>
        )}
      </div>
    </div>
  );
}
