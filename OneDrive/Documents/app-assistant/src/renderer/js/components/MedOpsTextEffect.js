import React, { useEffect, useState } from 'react';

const TEXT = 'MedOps';
const ANIMATION_DELAY = 100; // ms per letter (reduced from 200)

function MedOpsTextEffect({ onFinish }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (visibleCount < TEXT.length) {
      const timer = setTimeout(() => setVisibleCount(visibleCount + 1), ANIMATION_DELAY);
      return () => clearTimeout(timer);
    } else if (!done) {
      setTimeout(() => {
        setDone(true);
        if (onFinish) onFinish();
      }, 300); // Hold for a moment before finishing (reduced from 700)
    }
  }, [visibleCount, done, onFinish]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(to right, #5D26C1, #a17fe0, #59C173)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        transition: 'opacity 0.7s',
        opacity: done ? 0 : 1,
        pointerEvents: done ? 'none' : 'auto',
        cursor: 'pointer',
      }}
      onClick={() => {
        if (!done && onFinish) {
          setDone(true);
          onFinish();
        }
      }}
      title="Click to skip"
    >
      <h1 style={{
        color: '#fff',
        fontSize: '4rem',
        fontWeight: 'bold',
        letterSpacing: '0.15em',
        textShadow: '2px 2px 8px rgba(0,0,0,0.25)',
        margin: 0,
        display: 'flex',
        gap: '0.1em',
      }}>
        {TEXT.split('').map((char, i) => (
          <span
            key={i}
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transition: 'opacity 0.3s',
              display: 'inline-block',
            }}
          >
            {char}
          </span>
        ))}
      </h1>
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '0.9rem',
        textAlign: 'center',
        pointerEvents: 'none'
      }}>
        Click to skip
      </div>
    </div>
  );
}

export default MedOpsTextEffect; 