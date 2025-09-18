const net = require('net');
const fs = require('fs');
const path = require('path');
const { encrypt } = require(path.join(__dirname, '../app/utils/encryption'));
const getLogger = require('./logger');
const logger = getLogger('tcpClient.js');
const EventEmitter = require('events');

class TCPClient extends EventEmitter {
  constructor() {
    super(); // Call the parent constructor
    this.socket = null;
    this.connected = false;
    this.serverIp = null;
    this.serverPort = 3002;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.messageHandlers = new Map();
    this.pendingMessages = new Map();
    this.messageId = 0;
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    // Handle server welcome
    this.messageHandlers.set('SERVER_WELCOME', this.handleServerWelcome.bind(this));
    
    // Handle patient data acknowledgment
    this.messageHandlers.set('PATIENT_DATA_ACK', this.handlePatientDataAck.bind(this));
    
    // Handle file transfer acknowledgment
    this.messageHandlers.set('FILE_TRANSFER_ACK', this.handleFileTransferAck.bind(this));
    
    // Handle client identification acknowledgment
    this.messageHandlers.set('CLIENT_IDENTIFY_ACK', this.handleClientIdentifyAck.bind(this));
    
    // Handle health check acknowledgment
    this.messageHandlers.set('HEALTH_CHECK_ACK', this.handleHealthCheckAck.bind(this));
    
    // Handle patient data received broadcast
    this.messageHandlers.set('PATIENT_DATA_RECEIVED', this.handlePatientDataReceived.bind(this));
    
    // Handle client connected/disconnected
    this.messageHandlers.set('CLIENT_CONNECTED', this.handleClientConnected.bind(this));
    this.messageHandlers.set('CLIENT_DISCONNECTED', this.handleClientDisconnected.bind(this));
    
    // Handle errors
    this.messageHandlers.set('ERROR', this.handleError.bind(this));

    // Handle real-time chat messages from server
    this.messageHandlers.set('CHAT_MESSAGE', this.handleChatMessage.bind(this));
  }

  connect(serverIp) {
    return new Promise((resolve, reject) => {
      this.serverIp = serverIp;
      
      logger.info({ module: 'tcpClient.js', func: 'connect', message: `Connecting to TCP server at ${serverIp}:${this.serverPort}` });
      
      this.socket = new net.Socket();
      
      // Set connection timeout for faster failure detection
      const connectionTimeout = setTimeout(() => {
        if (!this.connected) {
          this.socket.destroy();
          reject(new Error('TCP connection timeout'));
        }
      }, 3000); // 3 second timeout
      
      this.socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        logger.info({ module: 'tcpClient.js', func: 'connect', message: 'Connected to TCP server' });
        resolve(true);
      });

      this.socket.on('data', (data) => {
        this.handleServerData(data);
      });

      this.socket.on('close', () => {
        clearTimeout(connectionTimeout);
        this.connected = false;
        logger.warn({ module: 'tcpClient.js', func: 'disconnect', message: 'Disconnected from TCP server' });
        this.scheduleReconnect();
      });

      this.socket.on('error', (err) => {
        clearTimeout(connectionTimeout);
        this.connected = false;
        logger.error({ module: 'tcpClient.js', func: 'connect_error', message: 'TCP connection error', error: err });
        reject(err);
      });

      this.socket.connect(this.serverPort, serverIp);
    });
  }

  handleServerData(data) {
    try {
      const messages = data.toString().split('\n').filter(msg => msg.trim());
      
      for (const messageStr of messages) {
        const message = JSON.parse(messageStr);
        logger.info({ module: 'tcpClient.js', func: 'handleServerData', message: `Received message: ${message.type}` });
        
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        } else {
          logger.warn({ module: 'tcpClient.js', func: 'handleServerData', message: `Unknown message type: ${message.type}` });
        }
      }
    } catch (err) {
      logger.error({ module: 'tcpClient.js', func: 'handleServerData', message: 'Error parsing server data', error: err });
    }
  }

  handleServerWelcome(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleServerWelcome', message: 'Server welcome received', data: message });
    
    // Identify ourselves to the server
    this.sendMessage({
      type: 'CLIENT_IDENTIFY',
      clientType: 'assistant-app',
      clientId: 'medops-assistant',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }

  handlePatientDataAck(message) {
    logger.info({ module: 'tcpClient.js', func: 'handlePatientDataAck', message: 'Patient data ACK received', data: message });
    
    if (message.success) {
      logger.info({ module: 'tcpClient.js', func: 'handlePatientDataAck', message: `Patient data transferred successfully: ${message.patientId}` });
    } else {
      logger.error({ module: 'tcpClient.js', func: 'handlePatientDataAck', message: 'Patient data transfer failed', error: message.error });
    }
  }

  handleFileTransferAck(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleFileTransferAck', message: 'File transfer ACK received', data: message });
    
    if (message.success) {
      logger.info({ module: 'tcpClient.js', func: 'handleFileTransferAck', message: `File transferred successfully: ${message.fileName}` });
    } else {
      logger.error({ module: 'tcpClient.js', func: 'handleFileTransferAck', message: 'File transfer failed', error: message.error });
    }
  }

  handleClientIdentifyAck(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleClientIdentifyAck', message: 'Client identification ACK received', data: message });
  }

  handleHealthCheckAck(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleHealthCheckAck', message: 'Health check ACK received', data: message });
  }

  handlePatientDataReceived(message) {
    logger.info({ module: 'tcpClient.js', func: 'handlePatientDataReceived', message: 'Patient data received broadcast', data: message });
  }

  handleClientConnected(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleClientConnected', message: 'Client connected', data: message });
  }

  handleClientDisconnected(message) {
    logger.info({ module: 'tcpClient.js', func: 'handleClientDisconnected', message: 'Client disconnected', data: message });
  }

  handleError(message) {
    logger.error({ module: 'tcpClient.js', func: 'handleError', message: 'Server error received', data: message });
  }

  sendMessage(message) {
    if (!this.connected || !this.socket) {
      logger.error({ module: 'tcpClient.js', func: 'sendMessage', message: 'Cannot send message - not connected' });
      return false;
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.socket.write(data);
      logger.info({ module: 'tcpClient.js', func: 'sendMessage', message: `Sent message: ${message.type}` });
      return true;
    } catch (err) {
      logger.error({ module: 'tcpClient.js', func: 'sendMessage', message: 'Error sending message', error: err });
      return false;
    }
  }

  async sendPatientData({ patientData, files, patientId }) {
    if (!this.connected) {
      throw new Error('Not connected to TCP server');
    }

    logger.info({ module: 'tcpClient.js', func: 'sendPatientData', message: `Sending patient data for patient: ${patientId}` });

    // Encrypt patient data
    const encryptedData = encrypt(JSON.stringify(patientData));
    
    const message = {
      type: 'PATIENT_DATA',
      patientData: {
        encrypted: true,
        data: encryptedData
      },
      patientId,
      files: files || [],
      timestamp: new Date().toISOString()
    };

    return this.sendMessage(message);
  }

  async sendFile(patientId, fileName, filePath) {
    if (!this.connected) {
      throw new Error('Not connected to TCP server');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    logger.info({ module: 'tcpClient.js', func: 'sendFile', message: `Sending file: ${fileName} for patient: ${patientId}` });

    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');

    const message = {
      type: 'FILE_TRANSFER',
      patientId,
      fileName,
      fileData: base64Data,
      fileSize: fileData.length,
      timestamp: new Date().toISOString()
    };

    return this.sendMessage(message);
  }

  async healthCheck() {
    if (!this.connected) {
      throw new Error('Not connected to TCP server');
    }

    const message = {
      type: 'HEALTH_CHECK',
      timestamp: new Date().toISOString()
    };

    return this.sendMessage(message);
  }

  // Add method to send chat messages
  async sendChatMessage({ id, sender, senderId, message, timestamp }) {
    if (!this.connected) {
      throw new Error('Not connected to TCP server');
    }
    const chatMessage = {
      type: 'CHAT_MESSAGE',
      id: id || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: sender || 'assistant',
      senderId: senderId || 'assistant',
      message,
      timestamp: timestamp || new Date().toISOString()
    };
    return this.sendMessage(chatMessage);
  }

  // Handler for incoming chat messages from server
  handleChatMessage(message) {
    // Forward to renderer via IPC if needed
    const { sender, senderId, message: chatText, id, timestamp } = message;
    if (global.mainWindow) {
      global.mainWindow.webContents.send('chat-message', {
        id,
        sender,
        senderId,
        message: chatText,
        timestamp
      });
    }
    // Emit event for listeners (e.g., networkManager)
    this.emit('chat-message', {
      id,
      sender,
      senderId,
      message: chatText,
      timestamp
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error({ module: 'tcpClient.js', func: 'scheduleReconnect', message: 'Max reconnection attempts reached' });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info({ module: 'tcpClient.js', func: 'scheduleReconnect', message: `Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms` });
    
    setTimeout(() => {
      if (!this.connected && this.serverIp) {
        this.connect(this.serverIp).catch(err => {
          logger.error({ module: 'tcpClient.js', func: 'scheduleReconnect', message: 'Reconnection failed', error: err });
        });
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    logger.info({ module: 'tcpClient.js', func: 'disconnect', message: 'Disconnected from TCP server' });
  }

  isConnected() {
    return this.connected && this.socket && !this.socket.destroyed;
  }

  getStatus() {
    return {
      connected: this.connected,
      serverIp: this.serverIp,
      serverPort: this.serverPort,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

module.exports = TCPClient; 