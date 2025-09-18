const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(basePath) {
    this.basePath = basePath;
    this._queue = Promise.resolve();
  }

  // Helper to queue file operations
  _enqueue(fn) {
    this._queue = this._queue.then(() => fn()).catch((e) => { console.error('FileManager queue error:', e); });
    return this._queue;
  }

  async savePatientFiles(patientId, filePaths) {
    return this._enqueue(async () => {
      const patientDir = path.join(this.basePath, patientId);
      
      if (!fs.existsSync(patientDir)) {
        fs.mkdirSync(patientDir, { recursive: true });
      }

      const savedFiles = [];
      
      for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        const destPath = path.join(patientDir, fileName);
        
        fs.copyFileSync(filePath, destPath);
        
        savedFiles.push({
          originalName: fileName,
          savedPath: destPath,
          size: fs.statSync(destPath).size,
          savedAt: new Date().toISOString()
        });
      }
      
      return savedFiles;
    });
  }

  async saveFileFromData(patientId, fileName, fileData, fileType) {
    return this._enqueue(async () => {
      const patientDir = path.join(this.basePath, patientId);
      
      if (!fs.existsSync(patientDir)) {
        fs.mkdirSync(patientDir, { recursive: true });
      }

      // Convert base64 data to buffer
      const buffer = Buffer.from(fileData, 'base64');
      const destPath = path.join(patientDir, fileName);
      
      fs.writeFileSync(destPath, buffer);
      
      return {
        originalName: fileName,
        savedPath: destPath,
        size: buffer.length,
        type: fileType,
        savedAt: new Date().toISOString()
      };
    });
  }

  async getPatientFiles(patientId) {
    return this._enqueue(async () => {
      const patientDir = path.join(this.basePath, patientId);
      
      if (!fs.existsSync(patientDir)) {
        return [];
      }

      const files = fs.readdirSync(patientDir);
      const fileList = [];
      
      for (const file of files) {
        const filePath = path.join(patientDir, file);
        const stats = fs.statSync(filePath);
        
        fileList.push({
          name: file,
          path: filePath,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      }
      
      return fileList;
    });
  }

  async deletePatientFile(patientId, fileName) {
    return this._enqueue(async () => {
      const filePath = path.join(this.basePath, patientId, fileName);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      } else {
        throw new Error('File not found');
      }
    });
  }

  async deletePatientDirectory(patientId) {
    return this._enqueue(async () => {
      const patientDir = path.join(this.basePath, patientId);
      
      if (fs.existsSync(patientDir)) {
        try {
          fs.rmSync(patientDir, { recursive: true, force: true });
          return true;
        } catch (error) {
          console.error(`Error deleting patient directory ${patientDir}:`, error);
          throw error;
        }
      }
      
      return false;
    });
  }

  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      console.error(`Error getting file size for ${filePath}:`, error);
      return 0;
    }
  }

  async copyFileToBackup(sourcePath, backupPath) {
    return this._enqueue(async () => {
      fs.copyFileSync(sourcePath, backupPath);
      return true;
    });
  }

  async createBackupArchive(backupPath) {
    return this._enqueue(async () => {
      const backupFilesPath = path.join(backupPath, 'PatientFiles');
      
      if (fs.existsSync(this.basePath)) {
        // Copy entire directory structure
        this.copyDirectoryRecursive(this.basePath, backupFilesPath);
      }
      
      return backupFilesPath;
    });
  }

  copyDirectoryRecursive(source, destination) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        this.copyDirectoryRecursive(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  async createBackup(backupPath) {
    return this._enqueue(async () => {
      const backupDir = path.join(backupPath, 'CabneoBackup');
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Copy all patient files
      if (fs.existsSync(this.basePath)) {
        const patients = fs.readdirSync(this.basePath);
        
        for (const patient of patients) {
          const patientDir = path.join(this.basePath, patient);
          const backupPatientDir = path.join(backupDir, patient);
          
          if (fs.statSync(patientDir).isDirectory()) {
            this.copyDirectoryRecursive(patientDir, backupPatientDir);
          }
        }
      }
      
      return backupDir;
    });
  }

  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      
      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = FileManager; 