import React from 'react';

function SectionHeader({ iconClass = 'fas fa-layer-group', title = '' }) {
  return (
    <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
      <div className="section-header__icon" aria-hidden>
        <i className={iconClass} />
      </div>
      <h3 className="section-header__title" style={{ margin: 0 }}>{title}</h3>
    </div>
  );
}

export default SectionHeader;
