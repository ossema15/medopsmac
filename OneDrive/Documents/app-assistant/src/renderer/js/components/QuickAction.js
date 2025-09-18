import React from 'react';

function QuickAction({ label, iconClass, gradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', onClick }) {
  const baseStyle = {
    background: gradient,
    color: 'white',
    border: 'none',
    borderRadius: 12,
    padding: '1rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
  };

  const handleMouseEnter = (e) => {
    e.currentTarget.style.transform = 'translateY(-2px)';
    e.currentTarget.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.18)';
  };
  const handleMouseLeave = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.15)';
  };

  return (
    <button
      className="quick-action"
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <span>
        <i className={iconClass} style={{ marginRight: 10 }} />
        {label}
      </span>
      <i className="fas fa-arrow-right" />
    </button>
  );
}

export default QuickAction;
