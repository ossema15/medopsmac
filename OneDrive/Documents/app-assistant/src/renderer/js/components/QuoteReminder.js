import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function QuoteReminder({ quote }) {
  const [visible, setVisible] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    // If the quote changes (new day), show again
    setVisible(true);
  }, [quote]);

  if (!quote || !visible) return null;

  return (
    <div className="quote-reminder-card">
      <p className="quote-reminder-heading">{t('reminder')}</p>
      <p className="quote-reminder-para">{quote}</p>
      <div className="quote-reminder-overlay"></div>
      <button className="quote-reminder-btn" onClick={() => setVisible(false)}>{t('close')}</button>
    </div>
  );
}

export default QuoteReminder; 