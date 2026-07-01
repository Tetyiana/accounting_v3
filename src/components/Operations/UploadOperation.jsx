import React, { useRef, useState } from 'react';

const UploadOperation = ({ onFileProcess }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onFileProcess(file);
  };

  return (
    <div
      className={`upload-zone${dragOver ? ' upload-zone--drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.docx,image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="upload-zone-icon">⇪</div>
      <p>Перетягніть файл сюди або натисніть, щоб обрати</p>
      <p className="cell-muted">PDF, фото, Excel (.xlsx) або Word (.docx)</p>
    </div>
  );
};

export default UploadOperation;
