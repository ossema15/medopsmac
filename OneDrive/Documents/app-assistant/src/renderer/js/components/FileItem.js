import React, { useState } from 'react';
import { useConfirm } from '../context/ConfirmContext';

const FileItem = ({ file, editingPatientId, setPatientFiles, t }) => {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);

  const handleOpen = async () => {
    setLoading(true);
    setError('');
    try {
      await window.electronAPI.openFile(file.path);
    } catch (e) {
      setError('Impossible d\'ouvrir le fichier.');
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    const proceed = await confirm({
      title: 'Supprimer le fichier',
      message: `Voulez-vous supprimer « ${file.name} » ?`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });
    if (!proceed) return;
    try {
      await window.electronAPI.deletePatientFile(editingPatientId, file.name);
      setPatientFiles(prev => prev.filter(f => f.name !== file.name));
    } catch (e) {
      setError('Erreur lors de la suppression.');
    }
  };

  const handleDownload = async () => {
    try {
      await window.electronAPI.downloadFile(file.path);
    } catch (e) {
      setError('Erreur lors du téléchargement.');
    }
  };

  return (
    <div key={`attached-file-${file.name}`} className="file-item">
      {isImage && <img src={`file://${file.path}`} alt={file.name} style={{ width: 32, height: 32, objectFit: 'cover', marginRight: 8, borderRadius: 4 }} />}
      <span
        className="file-link"
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') handleOpen(); }}
      >
        {file.name}
      </span>
      {loading && <span className="file-spinner" />}
      <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={handleDelete} aria-label="Supprimer le fichier">
        <i className="fas fa-trash"></i>
      </button>
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 4 }} onClick={handleDownload} aria-label="Télécharger le fichier">
        <i className="fas fa-download"></i>
      </button>
      {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
    </div>
  );
};

export default FileItem;