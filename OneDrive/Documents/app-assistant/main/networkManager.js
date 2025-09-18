const { ipcMain, BrowserWindow } = require('electron');
const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const getLogger = require('./logger');
const logger = getLogger('networkManager.js');

let socket = null;
let connectionStatus = 'disconnected';

let mainWindow = null;
let buffer = [];
let ackTimeouts = {};
let doctorIp = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30s
const BASE_RECONNECT_DELAY = 1000; // 1s
const MAX_RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes total retry window
let reconnectStartTime = null;

const CHUNK_SIZE = 1024 * 512; // 512KB per chunk

let networkDisconnected = false;
let lastKnownServerIp = null;
let lastIdentificationPayload = null;

// Track if the connection success popup has been shown
let hasShownConnectionPopup = false;

let uniqueClientId = null;
let uniqueMachineId = null;

// Track manual disconnect to prevent auto-reconnection
let manuallyDisconnected = false;
let reconnectTimeout = null;

function sendStatus(status) {
  console.log(`[DEBUG][networkManager] sendStatus called with: ${status}, previous: ${connectionStatus}`);
  connectionStatus = status;
  if (mainWindow) {
    console.log(`[DEBUG][networkManager] Sending status to renderer: ${status}`);
    mainWindow.webContents.send('network-status', status);
    mainWindow.webContents.send('connection-status', status);
    mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] sendStatus called with: ${status}`);
  } else {
    console.log(`[DEBUG][networkManager] mainWindow not available, cannot send status: ${status}`);
  }
  logger.info({ module: 'networkManager.js', func: 'sendStatus', message: `Network status: ${status}` });
}

function testConnection(ip) {
  return new Promise((resolve, reject) => {
    const url = `http://${ip}:3001`;
    logger.info({ module: 'networkManager.js', func: 'testConnection', message: `Testing connection to ${url}` });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Testing connection to ${url}`);
    
    const testSocket = io(url, {
      timeout: 5000,
      forceNew: true,
      autoConnect: false
    });
    
    testSocket.on('connect', () => {
      logger.info({ module: 'networkManager.js', func: 'testConnection', message: `Test connection successful to ${url}` });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Test connection successful to ${url}`);
      testSocket.disconnect();
      resolve(true);
    });
    
    testSocket.on('connect_error', (err) => {
      logger.error({ module: 'networkManager.js', func: 'testConnection', message: `Test connection error to ${url}`, error: err });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Test connection error to ${url}: ${err.message}`);
      testSocket.disconnect();
      reject(err);
    });
    
    testSocket.on('connect_timeout', () => {
      logger.error({ module: 'networkManager.js', func: 'testConnection', message: `Test connection timeout to ${url}` });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Test connection timeout to ${url}`);
      testSocket.disconnect();
      reject(new Error('Connection timeout'));
    });
    
    testSocket.connect();
  });
}

function setupSocket(ip) {
  logger.info({ module: 'networkManager.js', func: 'setupSocket', message: 'setupSocket called', ip, alreadyConnected: socket && socket.connected, doctorIp, stack: new Error().stack });
  
  // Don't connect if manually disconnected
  if (manuallyDisconnected) {
    logger.info({ module: 'networkManager.js', func: 'setupSocket', message: 'Manual disconnect active, skipping connection attempt' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Manual disconnect active, skipping connection attempt');
    return;
  }
  
  // Only reconnect if not already connected to the same IP
  if (socket && socket.connected && doctorIp === ip) {
    logger.info({ module: 'networkManager.js', func: 'setupSocket', message: `Already connected to ${ip}, skipping reconnect.` });
    return;
  }
  // Always disconnect any existing socket before connecting to a new IP
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  doctorIp = ip;
  lastKnownServerIp = ip;
  networkDisconnected = false;
  // Start with Socket.IO as primary communication method
  const url = `http://${ip}:3001`;
  logger.info({ module: 'networkManager.js', func: 'setupSocket', message: `Connecting to Doctor at ${url} (Socket.IO only)` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] setupSocket called with: ${url} (Socket.IO only)`);
  // Test connection first
  testConnection(ip).then(() => {
    logger.info({ module: 'networkManager.js', func: 'setupSocket', message: 'Connection test successful, establishing socket' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Connection test successful, establishing socket');
    establishSocketConnection(url);
  }).catch((err) => {
    logger.error({ module: 'networkManager.js', func: 'setupSocket', message: 'Connection test failed', error: err });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Connection test failed: ${err.message}`);
    sendStatus('disconnected');
  });
}

function establishSocketConnection(url) {
  socket = io(url, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: BASE_RECONNECT_DELAY,
    reconnectionDelayMax: MAX_RECONNECT_DELAY,
    autoConnect: true,
    timeout: 10000 // 10 second timeout
  });

  // Notify communication manager to attach to the single socket
  try {
    if (global.communicationManager && typeof global.communicationManager.attachExternalSocket === 'function') {
      global.communicationManager.attachExternalSocket(socket);
    }
  } catch (e) {
    logger.warn({ module: 'networkManager.js', func: 'establishSocketConnection', message: 'Failed to attach socket to communicationManager', error: e?.message });
  }

  socket.on('connect', () => {
    reconnectAttempts = 0;
    reconnectStartTime = null; // reset retry window on successful connect
    sendStatus('connected');
    logger.info({ module: 'networkManager.js', func: 'connect', message: 'Connected to Doctor' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] socket connected');
    console.log('🔗 [ASSISTANT APP] Connected to server at:', url);
    
    // Show popup only once on first successful connection
    if (!hasShownConnectionPopup && mainWindow) {
      mainWindow.webContents.send('show-connection-success-popup');
      hasShownConnectionPopup = true;
    }
    
    // Use unique clientId and machineId for handshake
    lastIdentificationPayload = {
      clientType: 'assistant-app',
      clientId: uniqueClientId || 'medops',
      machineId: uniqueMachineId || undefined,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    logger.info({ module: 'networkManager.js', func: 'connect', message: 'Sending clientAppConnect handshake', handshake: lastIdentificationPayload });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Sending clientAppConnect handshake: ' + JSON.stringify(lastIdentificationPayload));
    socket.emit('clientAppConnect', lastIdentificationPayload);
    logger.info({ module: 'networkManager.js', func: 'connect', message: 'Sent clientAppConnect identification', identification: lastIdentificationPayload });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Sent clientAppConnect identification');
    
    // Wait a moment for the connection to be fully established before flushing buffer
    setTimeout(() => {
      logger.info({ module: 'networkManager.js', func: 'connect', message: 'Flushing buffer after connection delay' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Flushing buffer after connection delay');
      flushBuffer();
    }, 1000);
  });

  socket.on('disconnect', (reason) => {
    logger.warn({ module: 'networkManager.js', func: 'disconnect', message: `Disconnected: ${reason}` });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] socket disconnected: ${reason}`);
    
    // Log additional disconnect information
    logger.info({
      module: 'networkManager.js',
      func: 'disconnect',
      message: `Disconnect details - reason: ${reason}, socket connected: ${socket?.connected}, buffer length: ${buffer.length}`,
      identification: lastIdentificationPayload,
      socketId: socket?.id,
      socketConnected: socket?.connected,
      networkDisconnected,
      doctorIp,
      lastKnownServerIp,
      manuallyDisconnected
    });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Disconnect details - reason: ${reason}, socket connected: ${socket?.connected}, buffer length: ${buffer.length}, identification: ${JSON.stringify(lastIdentificationPayload)}, manuallyDisconnected: ${manuallyDisconnected}`);
    
    sendStatus('disconnected');
    networkDisconnected = true;
    
    // Emit connection-lost event for global reconnection logic
    if (mainWindow) {
      mainWindow.webContents.send('connection-lost');
      logger.info({ module: 'networkManager.js', func: 'disconnect', message: 'Emitted connection-lost event for global reconnection' });
    }
    
    // Only schedule reconnect if it's not a manual disconnect and not a client-initiated disconnect
    if (!manuallyDisconnected && reason !== 'io client disconnect') {
      logger.info({ module: 'networkManager.js', func: 'disconnect', message: 'Server disconnected, scheduling reconnect...' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Server disconnected, scheduling reconnect...');
      scheduleReconnect();
    } else {
      logger.info({ module: 'networkManager.js', func: 'disconnect', message: 'Manual disconnect or client disconnect, not scheduling reconnect' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Manual disconnect or client disconnect, not scheduling reconnect');
    }
  });

  socket.on('connect_error', (err) => {
    sendStatus('disconnected');
    logger.error({ module: 'networkManager.js', func: 'connect_error', message: 'Connection error', error: err });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] socket connect_error: ${err.message}`);
    
    // Emit connection-lost event for global reconnection logic
    if (mainWindow) {
      mainWindow.webContents.send('connection-lost');
      logger.info({ module: 'networkManager.js', func: 'connect_error', message: 'Emitted connection-lost event for global reconnection' });
    }
    
    // Only schedule reconnect if not manually disconnected
    if (!manuallyDisconnected) {
      scheduleReconnect();
    } else {
      logger.info({ module: 'networkManager.js', func: 'connect_error', message: 'Manual disconnect active, not scheduling reconnect' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Manual disconnect active, not scheduling reconnect');
    }
  });

  socket.on('reconnect_attempt', () => {
    reconnectAttempts++;
    sendStatus('connecting');
    logger.info({ module: 'networkManager.js', func: 'reconnect_attempt', message: `Reconnect attempt #${reconnectAttempts}` });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] socket reconnect_attempt #${reconnectAttempts}`);
  });

  socket.on('reconnect', () => {
    sendStatus('connected');
    networkDisconnected = false;
    logger.info({ module: 'networkManager.js', func: 'reconnect', message: 'Reconnected to Doctor via Socket.IO' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] socket reconnected');
    
    // Re-identify as client app after reconnection
    const handshake = {
      clientType: 'assistant-app',
      clientId: uniqueClientId || 'medops',
      machineId: uniqueMachineId || undefined,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    logger.info({ module: 'networkManager.js', func: 'reconnect', message: 'Sending clientAppConnect handshake after reconnect', handshake });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Sending clientAppConnect handshake after reconnect: ' + JSON.stringify(handshake));
    socket.emit('clientAppConnect', handshake);
    logger.info({ module: 'networkManager.js', func: 'reconnect', message: 'Sent clientAppConnect identification after reconnect' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Sent clientAppConnect identification after reconnect');
    
    // Wait a moment for the connection to be fully established before flushing buffer
    setTimeout(() => {
      logger.info({ module: 'networkManager.js', func: 'reconnect', message: 'Flushing buffer after reconnect delay' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Flushing buffer after reconnect delay');
      flushBuffer();
    }, 1000);
  });

  // Listen for appointment:needed
  socket.on('appointment:needed', (data) => {
    logger.info({ module: 'networkManager.js', func: 'appointment:needed', message: 'Received appointment:needed', data });
    if (mainWindow) mainWindow.webContents.send('appointment-needed', data);
    // Send ACK
    socket.emit('appointment:needed:ack', { patientId: data.patientId });
  });

  // Listen for client app connection confirmation
  socket.on('clientAppConnected', (data) => {
    logger.info({ module: 'networkManager.js', func: 'clientAppConnected', message: 'Received clientAppConnected confirmation', data });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Client app connection confirmed: ${JSON.stringify(data)}`);
  });

  // Listen for client app disconnection notification
  socket.on('clientAppDisconnected', (data) => {
    logger.info({ module: 'networkManager.js', func: 'clientAppDisconnected', message: 'Received clientAppDisconnected notification', data });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Client app disconnection notified: ${JSON.stringify(data)}`);
  });

  // Listen for client connection status updates
  socket.on('clientConnectionStatus', (data) => {
    logger.info({ module: 'networkManager.js', func: 'clientConnectionStatus', message: 'Received client connection status update', data });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Client connection status: ${JSON.stringify(data)}`);
  });

  // Listen for debug messages from backend
  socket.on('debug', (data) => {
    logger.info({ module: 'networkManager.js', func: 'debug', message: 'Received debug message from backend', data });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] ${data.message || data}`);
  });

  // Listen for alert messages from backend
  socket.on('alert', (data) => {
    logger.warn({ module: 'networkManager.js', func: 'alert', message: 'Received alert from backend', data });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[ALERT][Backend] ${data.message || data}`);
  });

  // Listen for chat:message
  socket.on('chat:message', (data) => {
    logger.info({ module: 'networkManager.js', func: 'chat:message', message: 'Received chat:message', data });
    if (mainWindow) mainWindow.webContents.send('chat-message', data);
  });

  // Listen for doctor presence updates
  socket.on('doctorPresence', async (data) => {
    logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Received doctorPresence update', data });
    if (mainWindow) {
      mainWindow.webContents.send('doctor-presence', data);
      mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Forwarded doctorPresence event to renderer: ' + JSON.stringify(data));
    }
    
    // Forward to communication manager for dashboard status sending
    logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Checking communication manager availability', globalCommManager: !!global.communicationManager, dataOnline: data.online });
    
    if (global.communicationManager && data.online) {
      logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Forwarding doctorPresence to communication manager for dashboard status' });
      try {
        const result = await global.communicationManager.sendDashboardStatusOnConnection();
        if (result.success) {
          logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Dashboard status sent successfully via communication manager' });
        } else {
          logger.warn({ module: 'networkManager.js', func: 'doctorPresence', message: 'Dashboard status send failed', error: result.error });
        }
      } catch (error) {
        logger.error({ module: 'networkManager.js', func: 'doctorPresence', message: 'Error sending dashboard status via communication manager', error: error.message });
      }
    } else if (data.online) {
      // If doctor is online but communication manager is not available, try to wait for it
      logger.warn({ module: 'networkManager.js', func: 'doctorPresence', message: 'Communication manager not available, will retry in 2 seconds', globalCommManager: !!global.communicationManager, dataOnline: data.online });
      
      // Retry after a short delay
      setTimeout(async () => {
        if (global.communicationManager) {
          logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Communication manager now available, retrying dashboard status send' });
          try {
            const result = await global.communicationManager.sendDashboardStatusOnConnection();
            if (result.success) {
              logger.info({ module: 'networkManager.js', func: 'doctorPresence', message: 'Dashboard status sent successfully via communication manager (retry)' });
            } else {
              logger.warn({ module: 'networkManager.js', func: 'doctorPresence', message: 'Dashboard status send failed (retry)', error: result.error });
            }
          } catch (error) {
            logger.error({ module: 'networkManager.js', func: 'doctorPresence', message: 'Error sending dashboard status via communication manager (retry)', error: error.message });
          }
        } else {
          logger.error({ module: 'networkManager.js', func: 'doctorPresence', message: 'Communication manager still not available after retry', globalCommManager: !!global.communicationManager });
        }
      }, 2000);
    } else {
      logger.warn({ module: 'networkManager.js', func: 'doctorPresence', message: 'Communication manager not available or doctor not online', globalCommManager: !!global.communicationManager, dataOnline: data.online });
    }
  });
  socket.on('systemStatus', (data) => {
    logger.info({ module: 'networkManager.js', func: 'systemStatus', message: 'Received systemStatus update', data });
    if (mainWindow) {
      mainWindow.webContents.send('system-status', data);
      mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Forwarded systemStatus event to renderer: ' + JSON.stringify(data));
    }
  });
}

function scheduleReconnect() {
  // Don't schedule reconnect if manually disconnected
  if (manuallyDisconnected) {
    logger.info({ module: 'networkManager.js', func: 'scheduleReconnect', message: 'Manual disconnect active, not scheduling reconnect' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Manual disconnect active, not scheduling reconnect');
    return;
  }

  // Initialize retry window start
  if (!reconnectStartTime) {
    reconnectStartTime = Date.now();
  }
  const elapsed = Date.now() - reconnectStartTime;
  if (elapsed >= MAX_RETRY_WINDOW_MS) {
    logger.warn({ module: 'networkManager.js', func: 'scheduleReconnect', message: 'Max retry window reached (10 minutes). Stopping reconnection attempts.' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Max retry window reached (10 minutes). Stopping reconnection attempts.');
    // Do not schedule further reconnects
    return;
  }

  let delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  logger.info({ module: 'networkManager.js', func: 'scheduleReconnect', message: `Scheduling reconnect attempt #${reconnectAttempts + 1} in ${delay}ms` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Scheduling reconnect attempt #${reconnectAttempts + 1} in ${delay}ms`);

  reconnectTimeout = setTimeout(() => {
    if (doctorIp && !manuallyDisconnected) {
      setupSocket(doctorIp);
    }
  }, delay);
}

function flushBuffer() {
  logger.info({ module: 'networkManager.js', func: 'flushBuffer', message: `Flushing buffer with ${buffer.length} events` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Flushing buffer with ${buffer.length} events`);
  
  if (buffer.length === 0) {
    logger.info({ module: 'networkManager.js', func: 'flushBuffer', message: 'Buffer is empty, nothing to flush' });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Buffer is empty, nothing to flush');
    return;
  }
  
  while (buffer.length > 0 && socket && socket.connected) {
    const { event, payload, ackEvent } = buffer.shift();
    logger.info({ module: 'networkManager.js', func: 'flushBuffer', message: `Processing buffered event: ${event}` });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Processing buffered event: ${event}`);
    emitWithAck(event, payload, ackEvent);
  }
}

function emitWithAck(event, payload, ackEvent) {
  logger.info({ module: 'networkManager.js', func: 'emitWithAck', message: `Sending event: ${event} with ACK event: ${ackEvent}` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Sending event: ${event} with ACK event: ${ackEvent}`);
  
  if (!socket || !socket.connected) {
    buffer.push({ event, payload, ackEvent });
    logger.warn({ module: 'networkManager.js', func: 'emitWithAck', message: `Buffered event: ${event} - socket not connected` });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Buffered event: ${event} - socket not connected`);
    return;
  }
  
  let acked = false;
  const timeout = setTimeout(() => {
    if (!acked) {
      logger.warn({ module: 'networkManager.js', func: 'emitWithAck', message: `ACK timeout for event: ${event}` });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] ACK timeout for event: ${event}`);
      buffer.push({ event, payload, ackEvent });
      // Don't call sendStatus('disconnected') on ACK timeout as it might cause issues
      // The socket will handle disconnection naturally if needed
    }
  }, 5000);
  
  socket.emit(event, payload, (ack) => {
    acked = true;
    clearTimeout(timeout);
    if (ack && ack.success) {
      logger.info({ module: 'networkManager.js', func: 'emitWithAck', message: `ACK received for event: ${event}` });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] ACK received for event: ${event}`);
    } else {
      logger.warn({ module: 'networkManager.js', func: 'emitWithAck', message: `No ACK or failed for event: ${event}` });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] No ACK or failed for event: ${event}`);
    }
  });
}

function streamFile(file, patientId) {
  return new Promise((resolve, reject) => {
    const { path: filePath, name, size } = file;
    const totalChunks = Math.ceil(size / CHUNK_SIZE);
    let sentChunks = 0;
    let readStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    let chunkIndex = 0;
    logger.info({ module: 'networkManager.js', func: 'streamFile', message: `Streaming file: ${name}, size: ${size}, chunks: ${totalChunks}` });
    readStream.on('data', (chunk) => {
      if (!socket || !socket.connected) {
        readStream.destroy();
        logger.error({ module: 'networkManager.js', func: 'streamFile', message: 'Socket disconnected during streaming' });
        reject(new Error('Socket disconnected'));
        return;
      }
      socket.emit('file:chunk', {
        patientId,
        name,
        size,
        chunkIndex,
        totalChunks,
        data: chunk.toString('base64')
      }, (ack) => {
        if (ack && ack.success) {
          sentChunks++;
          chunkIndex++;
          if (sentChunks === totalChunks) {
            logger.info({ module: 'networkManager.js', func: 'streamFile', message: `File streamed: ${name}` });
            resolve();
          }
        } else {
          readStream.destroy();
          logger.error({ module: 'networkManager.js', func: 'streamFile', message: `Chunk failed for file: ${name}` });
          reject(new Error('Chunk failed'));
        }
      });
    });
    readStream.on('error', (err) => {
      logger.error({ module: 'networkManager.js', func: 'streamFile', message: 'Read stream error', error: err });
      reject(err);
    });
  });
}

// IPC handlers
function setupIPC(win) {
  console.log(`[DEBUG][networkManager] setupIPC called with win:`, !!win);
  mainWindow = win;
  console.log(`[DEBUG][networkManager] mainWindow set to:`, !!mainWindow);
  
  ipcMain.handle('network-connect', async (event, params) => {
    try {
      const { ip, clientId, machineId } = params || {};
      logger.info({ module: 'networkManager.js', func: 'network-connect', message: 'Received network-connect IPC', clientId, machineId });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Received network-connect IPC with clientId: ' + clientId + ', machineId: ' + machineId);
      uniqueClientId = clientId;
      uniqueMachineId = machineId;
      
      // Reset manual disconnect flag to allow connection
      manuallyDisconnected = false;
      logger.info({ module: 'networkManager.js', func: 'network-connect', message: 'Reset manual disconnect flag to allow connection' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Reset manual disconnect flag to allow connection');
      
      // Connect communication manager to doctor
      if (global.communicationManager) {
        logger.info({ module: 'networkManager.js', func: 'network-connect', message: 'Connecting communication manager to doctor', ip });
        if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Connecting communication manager to doctor at ' + ip);
        try {
          await global.communicationManager.connectToDoctor(ip);
          logger.info({ module: 'networkManager.js', func: 'network-connect', message: 'Communication manager connected to doctor successfully' });
          if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Communication manager connected to doctor successfully');
        } catch (commError) {
          logger.error({ module: 'networkManager.js', func: 'network-connect', message: 'Error connecting communication manager to doctor', error: commError.message });
          if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Error connecting communication manager to doctor: ' + commError.message);
          // Continue with network connection even if communication manager fails
        }
      } else {
        logger.warn({ module: 'networkManager.js', func: 'network-connect', message: 'Communication manager not available' });
        if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Communication manager not available');
      }
      
      await testConnection(ip);
      setupSocket(ip);
      return { success: true };
    } catch (err) {
      sendStatus('disconnected');
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('network-disconnect', async (event) => {
    try {
      // Set manual disconnect flag to prevent auto-reconnection
      manuallyDisconnected = true;
      
      // Clear any pending reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
        logger.info({ module: 'networkManager.js', func: 'network-disconnect', message: 'Cleared pending reconnect timeout' });
        if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Cleared pending reconnect timeout');
      }
      
      // Reset reconnect attempts counter
      reconnectAttempts = 0;
      
      // Disconnect socket if connected
      if (socket) {
        socket.disconnect();
        socket = null;
        logger.info({ module: 'networkManager.js', func: 'network-disconnect', message: 'Socket disconnected' });
        if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Socket disconnected');
      }
      
      // Clear buffer
      buffer.length = 0;
      logger.info({ module: 'networkManager.js', func: 'network-disconnect', message: 'Buffer cleared' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Buffer cleared');
      
      // Update status
      sendStatus('disconnected');
      networkDisconnected = true;
      
      logger.info({ module: 'networkManager.js', func: 'network-disconnect', message: 'Manually disconnected from doctor - all retry mechanisms cleared' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Manually disconnected from doctor - all retry mechanisms cleared');
      
      return { success: true };
    } catch (err) {
      logger.error({ module: 'networkManager.js', func: 'network-disconnect', message: 'Error disconnecting', error: err });
      return { success: false, message: err.message };
    }
  });
  ipcMain.handle('send-chat-message', async (event, message) => {
    // Only use Socket.IO connection
    if (!socket || !socket.connected) {
      throw new Error('Network not connected');
    }
    emitWithAck('chat:message', message, 'chat:message:ack');
  });

  ipcMain.removeHandler('test-ipc');
  ipcMain.handle('test-ipc', (event, params) => {
    logger.info({ module: 'networkManager.js', func: 'test-ipc', message: 'Received test-ipc', params });
    if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Received test-ipc with params: ' + JSON.stringify(params));
    return params;
  });

  // Add handlers for handshake events
  ipcMain.handle('frontend-ready', async () => {
    if (socket && socket.connected) {
      socket.emit('frontendReady');
      logger.info({ module: 'networkManager.js', func: 'frontend-ready', message: 'Emitted frontendReady event' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Emitted frontendReady event');
      return { success: true };
    }
    return { success: false, message: 'Socket not connected' };
  });
  ipcMain.handle('doctor-logged-in', async () => {
    if (socket && socket.connected) {
      socket.emit('doctorLoggedIn');
      logger.info({ module: 'networkManager.js', func: 'doctor-logged-in', message: 'Emitted doctorLoggedIn event' });
      if (mainWindow) mainWindow.webContents.send('network-status-debug', '[DEBUG][Backend] Emitted doctorLoggedIn event');
      return { success: true };
    }
    return { success: false, message: 'Socket not connected' };
  });
}

// Add isConnected function to check connection status
function isConnected() {
  // Check if connected via Socket.IO only
  const socketConnected = socket && socket.connected;
  const status = connectionStatus === 'connected' && socketConnected;
  logger.info({ 
    module: 'networkManager.js', 
    func: 'isConnected', 
    message: `Connection status check - socket: ${socketConnected}, status: ${connectionStatus}, result: ${status}` 
  });
  console.log(`[DEBUG][networkManager] isConnected() called - socket: ${socketConnected}, status: ${connectionStatus}, result: ${status}`);
  return status;
}

// Add function to check if manually disconnected
function isManuallyDisconnected() {
  return manuallyDisconnected;
}

// Add sendPatientData function to send patient data via network
async function sendPatientData({ patientData, files, patientId }) {
  // Only use Socket.IO connection
  await sendPatientDataSocketIO({ patientData, files, patientId });
}

async function sendPatientDataSocketIO({ patientData, files, patientId }) {
  if (!socket || !socket.connected) {
    throw new Error('Network not connected');
  }
  
  logger.info({ module: 'networkManager.js', func: 'sendPatientDataSocketIO', message: `Sending patient data via Socket.IO for patient: ${patientId}` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Sending patient data via Socket.IO for patient: ${patientId}`);
  
  // Send patient data
  const payload = { patientData, patientId };
  console.log('🔗 [ASSISTANT APP] Sending patient data payload:', payload);
  emitWithAck('patient:data', payload, 'patient:data:ack');
  
  // Send files if provided
  if (files && files.length > 0) {
    for (const file of files) {
      try {
        await streamFile(file, patientId);
      } catch (err) {
        logger.error({ module: 'networkManager.js', func: 'sendPatientDataSocketIO', message: `Error streaming file: ${file}`, error: err });
        if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Error streaming file: ${file}: ${err.message}`);
      }
    }
  }
  
  logger.info({ module: 'networkManager.js', func: 'sendPatientDataSocketIO', message: `Patient data sent successfully via Socket.IO for patient: ${patientId}` });
  if (mainWindow) mainWindow.webContents.send('network-status-debug', `[DEBUG][Backend] Patient data sent successfully via Socket.IO for patient: ${patientId}`);
}

module.exports = {
  setupIPC,
  setupSocket,
  sendStatus,
  testConnection,
  isConnected,
  isManuallyDisconnected,
  sendPatientData,
  getSocket: () => socket
};