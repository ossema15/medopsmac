// Holiday service using Calendarific API with local fallback
const CALENDARIFIC_API_KEY = 'LHxyjpcKnjYq48mKKpYi3WsGUOwp3uEQ';
const CALENDARIFIC_BASE_URL = 'https://calendarific.com/api/v2';

// Pre-downloaded holiday data for Tunisia (2020-2040)
const LOCAL_HOLIDAYS = {
  'TN': {
    '2020': [
      { date: '2020-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2020-04-20', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2020-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2020-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2020-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2020-08-15', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2020-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2020-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2020-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2021': [
      { date: '2021-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2021-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2021-05-13', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2021-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2021-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2021-08-21', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2021-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2021-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2021-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2022': [
      { date: '2022-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2022-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2022-05-02', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2022-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2022-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2022-08-10', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2022-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2022-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2022-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2023': [
      { date: '2023-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2023-04-21', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2023-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2023-06-28', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2023-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2023-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2023-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2023-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2023-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2024': [
      { date: '2024-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2024-04-10', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2024-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2024-06-17', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2024-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2024-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2024-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2024-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2024-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2025': [
      { date: '2025-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2025-03-31', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2025-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2025-06-07', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2025-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2025-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2025-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2025-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2025-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2026': [
      { date: '2026-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2026-03-20', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2026-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2026-05-27', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2026-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2026-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2026-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2026-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2026-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2027': [
      { date: '2027-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2027-03-10', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2027-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2027-05-16', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2027-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2027-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2027-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2027-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2027-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2028': [
      { date: '2028-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2028-02-27', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2028-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2028-05-05', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2028-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2028-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2028-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2028-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2028-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2029': [
      { date: '2029-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2029-02-16', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2029-04-24', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2029-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2029-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2029-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2029-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2029-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2029-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2030': [
      { date: '2030-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2030-02-05', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2030-04-14', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2030-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2030-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2030-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2030-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2030-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2030-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2031': [
      { date: '2031-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2031-01-25', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2031-04-03', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2031-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2031-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2031-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2031-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2031-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2031-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2032': [
      { date: '2032-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2032-01-14', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2032-03-23', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2032-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2032-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2032-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2032-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2032-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2032-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2033': [
      { date: '2033-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2033-01-03', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2033-03-12', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2033-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2033-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2033-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2033-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2033-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2033-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2034': [
      { date: '2034-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2034-02-22', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2034-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2034-05-01', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2034-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2034-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2034-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2034-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2034-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2035': [
      { date: '2035-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2035-02-11', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2035-04-20', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2035-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2035-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2035-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2035-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2035-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2035-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2036': [
      { date: '2036-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2036-01-31', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2036-04-09', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2036-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2036-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2036-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2036-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2036-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2036-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2037': [
      { date: '2037-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2037-01-20', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2037-03-30', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2037-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2037-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2037-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2037-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2037-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2037-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2038': [
      { date: '2038-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2038-01-09', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2038-03-19', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2038-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2038-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2038-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2038-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2038-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2038-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2039': [
      { date: '2039-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2039-02-28', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2039-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2039-05-08', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2039-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2039-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2039-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2039-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2039-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ],
    '2040': [
      { date: '2040-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'TN' },
      { date: '2040-02-17', name: 'Aïd el-Fitr', description: 'Fin du Ramadan', type: 'Religious', country: 'TN' },
      { date: '2040-04-27', name: 'Aïd al-Adha', description: 'Fête du sacrifice', type: 'Religious', country: 'TN' },
      { date: '2040-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'TN' },
      { date: '2040-07-25', name: 'Fête de la République', description: 'Proclamation de la République', type: 'National', country: 'TN' },
      { date: '2040-08-13', name: 'Fête de la Femme', description: 'Journée nationale de la femme', type: 'National', country: 'TN' },
      { date: '2040-10-15', name: 'Évacuation', description: 'Évacuation de Bizerte', type: 'National', country: 'TN' },
      { date: '2040-11-07', name: 'Fête de la Révolution', description: 'Changement du 7 novembre', type: 'National', country: 'TN' },
      { date: '2040-12-25', name: 'Noël', description: 'Nativité de Jésus-Christ', type: 'Religious', country: 'TN' }
    ]
  },
  'DZ': {
    '2024': [
      { date: '2024-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'DZ' },
      { date: '2024-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'DZ' },
      { date: '2024-07-05', name: 'Fête de l\'Indépendance', description: 'Indépendance de l\'Algérie', type: 'National', country: 'DZ' },
      { date: '2024-11-01', name: 'Fête de la Révolution', description: 'Début de la révolution algérienne', type: 'National', country: 'DZ' }
    ],
    '2025': [
      { date: '2025-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'DZ' },
      { date: '2025-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'DZ' },
      { date: '2025-07-05', name: 'Fête de l\'Indépendance', description: 'Indépendance de l\'Algérie', type: 'National', country: 'DZ' },
      { date: '2025-11-01', name: 'Fête de la Révolution', description: 'Début de la révolution algérienne', type: 'National', country: 'DZ' }
    ],
    '2026': [
      { date: '2026-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'DZ' },
      { date: '2026-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'DZ' },
      { date: '2026-07-05', name: 'Fête de l\'Indépendance', description: 'Indépendance de l\'Algérie', type: 'National', country: 'DZ' },
      { date: '2026-11-01', name: 'Fête de la Révolution', description: 'Début de la révolution algérienne', type: 'National', country: 'DZ' }
    ]
  },
  'MR': {
    '2024': [
      { date: '2024-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'MR' },
      { date: '2024-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'MR' },
      { date: '2024-11-28', name: 'Fête de l\'Indépendance', description: 'Indépendance de la Mauritanie', type: 'National', country: 'MR' }
    ],
    '2025': [
      { date: '2025-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'MR' },
      { date: '2025-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'MR' },
      { date: '2025-11-28', name: 'Fête de l\'Indépendance', description: 'Indépendance de la Mauritanie', type: 'National', country: 'MR' }
    ],
    '2026': [
      { date: '2026-01-01', name: 'Nouvel An', description: 'Jour de l\'an', type: 'National', country: 'MR' },
      { date: '2026-05-01', name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'MR' },
      { date: '2026-11-28', name: 'Fête de l\'Indépendance', description: 'Indépendance de la Mauritanie', type: 'National', country: 'MR' }
    ]
  }
};

// Generate fixed-date national holidays for offline coverage (DZ, MR)
function generateFixedDateHolidays(country, year) {
  const y = String(year);
  if (country === 'DZ') {
    return [
      { date: `${y}-01-01`, name: 'Nouvel An', description: "Jour de l'an", type: 'National', country: 'DZ' },
      { date: `${y}-05-01`, name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'DZ' },
      { date: `${y}-07-05`, name: "Fête de l'Indépendance", description: "Indépendance de l'Algérie", type: 'National', country: 'DZ' },
      { date: `${y}-11-01`, name: 'Fête de la Révolution', description: 'Début de la révolution algérienne', type: 'National', country: 'DZ' },
    ];
  }
  if (country === 'MR') {
    return [
      { date: `${y}-01-01`, name: 'Nouvel An', description: "Jour de l'an", type: 'National', country: 'MR' },
      { date: `${y}-05-01`, name: 'Fête du Travail', description: 'Journée internationale des travailleurs', type: 'National', country: 'MR' },
      { date: `${y}-11-28`, name: "Fête de l'Indépendance", description: 'Indépendance de la Mauritanie', type: 'National', country: 'MR' },
    ];
  }
  return [];
}

class HolidayService {
  constructor() {
    this.cache = new Map(); // Cache holidays to avoid repeated API calls
    this.isOnline = true; // Track online status
  }

  // Check if we're online
  async checkOnlineStatus() {
    try {
      const response = await fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      this.isOnline = true;
      return true;
    } catch (error) {
      this.isOnline = false;
      return false;
    }
  }

  async fetchHolidays(year, country = 'TN') {
    const cacheKey = `${country}-${year}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Check if we have local data for this year
    if (LOCAL_HOLIDAYS[country] && LOCAL_HOLIDAYS[country][year]) {
      const localHolidays = LOCAL_HOLIDAYS[country][year];
      this.cache.set(cacheKey, localHolidays);
      console.log(`Using local holiday data for ${country} ${year}`);
      return localHolidays;
    }

    // Try to fetch from API if online
    const isOnline = await this.checkOnlineStatus();
    if (isOnline) {
      try {
        const response = await fetch(
          `${CALENDARIFIC_BASE_URL}/holidays?api_key=${CALENDARIFIC_API_KEY}&country=${country}&year=${year}&type=national`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(`API error: ${data.error}`);
        }

        const holidays = data.response.holidays.map(holiday => ({
          date: holiday.date.iso,
          name: holiday.name,
          description: holiday.description,
          type: holiday.type[0], // Usually 'National'
          country: holiday.country.id
        }));

        // Cache the result
        this.cache.set(cacheKey, holidays);
        console.log(`Fetched holiday data from API for ${country} ${year}`);
        return holidays;
      } catch (error) {
        console.error('Error fetching holidays from API:', error);
        // Fall back to local data if available for nearby years
        return this.getFallbackHolidays(year, country);
      }
    } else {
      console.log('Offline mode: using local holiday data');
      return this.getFallbackHolidays(year, country);
    }
  }

  // Get fallback holidays from local data for nearby years
  getFallbackHolidays(year, country = 'TN') {
    if (!LOCAL_HOLIDAYS[country]) {
      // If no local dataset but we can synthesize fixed dates for DZ/MR, do it
      const gen = generateFixedDateHolidays(country, year);
      if (gen.length) return gen;
      return [];
    }

    // Find the closest year with data
    const availableYears = Object.keys(LOCAL_HOLIDAYS[country]).map(Number).sort((a, b) => a - b);
    const targetYear = parseInt(year);
    
    let closestYear = availableYears[0];
    let minDiff = Math.abs(targetYear - closestYear);
    
    for (const availableYear of availableYears) {
      const diff = Math.abs(targetYear - availableYear);
      if (diff < minDiff) {
        minDiff = diff;
        closestYear = availableYear;
      }
    }

    if (minDiff <= 5) { // Only use fallback if within 5 years
      const fallbackHolidays = LOCAL_HOLIDAYS[country][closestYear.toString()];
      console.log(`Using fallback holiday data from ${closestYear} for ${year}`);
      return fallbackHolidays;
    }

    // As a last resort for DZ/MR, synthesize fixed-date holidays for the requested year
    const gen = generateFixedDateHolidays(country, year);
    if (gen.length) {
      console.log(`Generated fixed-date offline holidays for ${country} ${year}`);
      return gen;
    }

    console.log(`No suitable fallback data found for ${year}`);
    return [];
  }

  // Get holidays for a specific month
  async getHolidaysForMonth(year, month, country = 'TN') {
    const holidays = await this.fetchHolidays(year, country);
    const monthStr = month.toString().padStart(2, '0');
    
    return holidays.filter(holiday => 
      holiday.date.startsWith(`${year}-${monthStr}`)
    );
  }

  // Check if a specific date is a holiday
  async isHoliday(date, country = 'TN') {
    const year = new Date(date).getFullYear();
    const holidays = await this.fetchHolidays(year, country);
    
    return holidays.find(holiday => holiday.date === date);
  }

  // Get data source info
  getDataSourceInfo(year, country = 'TN') {
    if (LOCAL_HOLIDAYS[country] && LOCAL_HOLIDAYS[country][year]) {
      return { source: 'local', reliable: true };
    }
    return { source: this.isOnline ? 'api' : 'fallback', reliable: this.isOnline };
  }

  // Clear cache (useful for testing or when API key changes)
  clearCache() {
    this.cache.clear();
  }

  // Get supported countries (you might want to cache this too)
  async getSupportedCountries() {
    try {
      const response = await fetch(
        `${CALENDARIFIC_BASE_URL}/countries?api_key=${CALENDARIFIC_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`API error: ${data.error}`);
      }

      return data.response.countries.map(country => ({
        code: country.country_id,
        name: country.country_name
      }));
    } catch (error) {
      console.error('Error fetching countries:', error);
      return [];
    }
  }

  // Get coverage information
  getCoverageInfo() {
    const countries = Object.keys(LOCAL_HOLIDAYS);
    const totalYears = countries.reduce((total, country) => {
      return total + Object.keys(LOCAL_HOLIDAYS[country]).length;
    }, 0);
    
    return {
      countries: countries,
      totalYears: totalYears,
      yearRange: '2020-2040',
      coverage: 'Tunisia holidays for 20 years (2020-2040)'
    };
  }
}

export default new HolidayService(); 