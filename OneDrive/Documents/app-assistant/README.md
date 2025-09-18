# MedOps Assistant Application

A comprehensive medical practice management system built with Electron, designed for private doctor's offices. This application provides patient management, appointment scheduling, real-time communication, and secure data handling.

## Features

### Core Functionality
- **Patient Management**: Register new patients with comprehensive medical information
- **Queue Management**: Real-time patient queue with status tracking (Waiting, With Doctor, Canceled)
- **Appointment Scheduling**: 15-minute interval scheduling from 9:00 AM to 4:30 PM
- **File Management**: Attach and manage patient files with secure storage
- **Real-time Communication**: Messaging system with the doctor's machine
- **Data Transfer**: Secure patient data transfer to doctor's machine
- **Backup System**: Configurable backup to external drives

### Technical Features
- **Network Communication**: WiFi connectivity
- **Local Database**: SQLite database with automatic creation and persistence
- **Encryption**: Data encryption for secure transfer and storage
- **Multilingual Support**: French (default) and English interfaces
- **Modern UI**: Clean, medical-themed interface with responsive design

## System Requirements

- **Operating System**: Windows 10/11
- **Node.js**: Version 16 or higher
- **Administrator Privileges**: Required for installation and file system access
- **Storage**: Minimum 1GB free space on C: drive
- **Network**: WiFi capability for doctor communication

## Installation

### Prerequisites
1. Install [Node.js](https://nodejs.org/) (version 16 or higher)
2. Ensure administrator privileges on the target machine

### Setup Instructions

1. **Clone or Download the Application**
   ```bash
   git clone <repository-url>
   cd medops-assistant
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Application**
   ```bash
   npm run build
   ```

4. **Start the Application**
   ```bash
   npm start
   ```

### First Launch Setup
On first launch, the application will:
- Create the necessary directory structure (`C:\MedOps\`)
- Initialize the SQLite database
- Set up default settings
- Create patient file storage directories

## Configuration

### Initial Settings
1. **Login**: Use default credentials
   - Username: `admin`
   - Password: `medops2024`

2. **Communication Setup**
   - Navigate to Settings → Communication
   - Configure doctor's machine IP (WiFi)

3. **Backup Configuration**
        - Navigate to Settings → Backup
     - Select backup drive using the folder browser
     - Test backup functionality
  
  4. **Language Selection**
   - Navigate to Settings → Language
   - Choose between French (default) or English

## Usage Guide

### Patient Registration
1. Navigate to "Patients" in the sidebar
2. Fill in patient information:
   - Name (required)
   - Year of Birth (required)
   - Phone number
   - Emergency contact
   - Reason for visit
   - Medical history
3. Attach files using "Add Files" button
4. Click "Save Patient"

### Queue Management
1. Navigate to "Queue" in the sidebar
2. View patients by status:
   - **Waiting**: Patients ready to see the doctor
   - **With Doctor**: Currently being treated
   - **Canceled**: Appointments that were canceled
3. Use action buttons to:
   - Send patient to doctor
   - Cancel patient appointment
   - Update patient status

### Appointment Scheduling
1. Navigate to "Appointments" in the sidebar
2. Click "Schedule Appointment"
3. Select:
   - Patient name
   - Date
   - Time slot (15-minute intervals)
   - Reason for visit
4. Click "Book Appointment"

### Communication with Doctor
1. Click the floating message icon (bottom-right corner)
2. Send and receive real-time messages
3. Receive appointment notifications from doctor
4. Handle "Book Appointment" requests

### Data Transfer
1. In the Queue, click "Send to Doctor" for a patient
2. Patient data and files are encrypted and sent
3. Patient status automatically updates to "With Doctor"

## File Structure

```
medops/
├── main.js                 # Main Electron process
├── preload.js             # Preload script for security
├── package.json           # Dependencies and scripts
├── webpack.config.js      # Webpack configuration
├── src/
│   ├── database/
│   │   └── database.js    # SQLite database operations
│   ├── communication/
│   │   └── communicationManager.js  # WiFi communication
│   ├── utils/
│   │   ├── fileManager.js # File operations
│   │   └── encryption.js  # Data encryption utilities
│   └── renderer/
│       ├── index.html     # Main HTML file
│       ├── styles/
│       │   └── main.css   # Application styles
│       └── js/
│           ├── index.js   # React entry point
│           ├── App.js     # Main React component
│           ├── i18n.js    # Internationalization
│           ├── components/ # React components
│           └── pages/     # Page components
└── C:\MedOps\            # Application data (created on first run)
    ├── Data/
    │   ├── medops.db      # SQLite database
    │   └── PatientFiles/  # Patient file storage
```

## Database Schema

### Patients Table
- `id`: Patient identifier (name_yearofbirth)
- `name`: Patient name
- `phone`: Contact phone number
- `urgent_contact`: Emergency contact information
- `reason_for_visit`: Visit purpose
- `medical_history`: Medical background
- `year_of_birth`: Birth year
- `status`: Current status (waiting/with_doctor/canceled)
- `created_at`: Registration timestamp
- `updated_at`: Last update timestamp

### Appointments Table
- `id`: Unique appointment identifier
- `patient_id`: Reference to patient
- `patient_name`: Patient name
- `appointment_date`: Scheduled date
- `appointment_time`: Scheduled time
- `reason`: Appointment reason
- `status`: Appointment status
- `created_at`: Creation timestamp

### Settings Table
- `key`: Setting name
- `value`: Setting value
- `updated_at`: Last update timestamp

### Messages Table
- `id`: Message identifier
- `sender`: Message sender (assistant/doctor)
- `message`: Message content
- `timestamp`: Message timestamp
- `is_read`: Read status

## Security Features

- **Data Encryption**: All data transfers are encrypted using AES-256
- **Secure IPC**: Electron IPC communication with context isolation
- **File System Security**: Restricted access to application directories
- **Password Protection**: Secure login system
- **Backup Encryption**: Encrypted backup files

## Troubleshooting

### Common Issues

1. **Application Won't Start**
   - Ensure Node.js is installed (version 16+)
   - Run `npm install` to install dependencies
   - Check administrator privileges

2. **Database Errors**
   - Verify write permissions to C: drive
   - Check available disk space
   - Restart application

3. **Communication Issues**
   - Verify network connectivity (WiFi mode)
   
   - Confirm doctor's machine IP address
   - Check firewall settings

4. **File Upload Problems**
   - Ensure sufficient disk space
   - Check file permissions
   - Verify file size limits

### Logs and Debugging
- Application logs are stored in the Electron console
- Database file: `C:\MedOps\Data\medops.db`
- Check Windows Event Viewer for system errors

## Development

### Building for Production
```bash
npm run dist
```

### Development Mode
```bash
npm run dev
```

### Watch Mode (for development)
```bash
npm run watch
```

## Support

For technical support or feature requests, please contact the development team.

## License

This application is proprietary software developed for MedOps medical practice management.

## Version History

- **v1.0.0**: Initial release with core functionality
  - Patient management
  - Queue system
  - Appointment scheduling
  - Real-time communication
  - File management
  - Backup system
  - Multilingual support 