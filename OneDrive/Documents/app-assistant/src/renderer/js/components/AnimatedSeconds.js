import React from 'react';

function AnimatedSeconds({ seconds }) {
  const tens = Math.floor(seconds / 10);
  const ones = seconds % 10;
  // Render only the current digit for each column, but keep the structure for animation
  return (
    <span className="dashboard-flip-clock">
      <span className="container">
        <span className="nums nums-ten">
          {[...Array(10).keys()].map(num => (
            <span
              key={num}
              className="num"
              data-num={num}
              data-num-next={(num + 1) % 10}
              style={{ opacity: num === tens ? 1 : 0 }}
            >
              {num}
            </span>
          ))}
        </span>
        <span className="nums nums-one">
          {[...Array(10).keys()].map(num => (
            <span
              key={num}
              className="num"
              data-num={num}
              data-num-next={(num + 1) % 10}
              style={{ opacity: num === ones ? 1 : 0 }}
            >
              {num}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export default AnimatedSeconds; 