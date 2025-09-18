import React from 'react';

function StatCard({ color = '#667eea', tint = '#eef2ff', iconClass = 'fas fa-users', value = 0, label = '', onClick }) {
  const chipBg = `${color}22`;
  const cardStyle = {
    background: 'linear-gradient(180deg, #ffffff 0%, #fafbff 100%)',
    border: '1px solid #eef1f7',
    borderRadius: 16,
    padding: '1rem',
    minWidth: 180,
    flex: 1,
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: '0 6px 18px rgba(17, 24, 39, 0.06)',
    transition: 'all 0.25s ease',
  };

  const handleMouseEnter = (e) => {
    e.currentTarget.style.transform = 'translateY(-2px)';
    e.currentTarget.style.boxShadow = '0 12px 26px rgba(17,24,39,0.10)';
  };
  const handleMouseLeave = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = '0 6px 18px rgba(17,24,39,0.06)';
  };

  return (
    <div
      className="card--stat"
      style={cardStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="stat-number" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, color: '#1f2937', lineHeight: 1 }}>{value}</div>
          <div className="stat-label" style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, marginTop: 6 }}>{label}</div>
        </div>
        <div
          className="icon-chip"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: chipBg,
            color,
          }}
          aria-hidden
        >
          <i className={iconClass} style={{ fontSize: '1.2rem' }} />
        </div>
      </div>
    </div>
  );
}

export default StatCard;
