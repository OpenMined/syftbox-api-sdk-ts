/**
 * Testing Application Module - SyftBox API SDK Testing Interface
 * 
 * This module provides comprehensive testing functionality for:
 * - Client initialization and authentication
 * - File upload/download testing
 * - WebSocket real-time communication
 * - ACL and Datasite services
 * - Real-time status monitoring
 */

class TestingApp {
    constructor() {
        this.client = null;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.logEntries = [];
        this.wsConnection = null;
        this.lastUploadedFile = null; // Track the last uploaded file for download test
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.initializeLogging();
            
            this.log('🚀 SyftBox API SDK Test Suite Ready', 'critical');
            this.log('Testing new TypeScript SDK with full feature set', 'info');
            this.log('Available services: Auth, Blob, WebSocket, RPC, ACL, Datasite', 'info');
            
            console.log('✅ Testing application initialized');
        } catch (error) {
            console.error('❌ Failed to initialize testing app:', error);
        }
    }

    setupEventListeners() {
        // Initialize client button
        const initBtn = document.getElementById('init-btn');
        if (initBtn) {
            initBtn.addEventListener('click', () => this.initializeClient());
        }

        // OTP request button
        const otpRequestBtn = document.getElementById('otp-request-btn');
        if (otpRequestBtn) {
            otpRequestBtn.addEventListener('click', () => this.requestOTP());
        }

        // OTP verify button
        const otpVerifyBtn = document.getElementById('otp-verify-btn');
        if (otpVerifyBtn) {
            otpVerifyBtn.addEventListener('click', () => this.verifyOTP());
        }

        // Test buttons
        const testBtn = document.getElementById('test-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testUpload());
        }

        const downloadTestBtn = document.getElementById('download-test-btn');
        if (downloadTestBtn) {
            downloadTestBtn.addEventListener('click', () => this.testDownload());
        }

        const websocketBtn = document.getElementById('websocket-btn');
        if (websocketBtn) {
            websocketBtn.addEventListener('click', () => this.testWebSocket());
        }

        const aclBtn = document.getElementById('acl-btn');
        if (aclBtn) {
            aclBtn.addEventListener('click', () => this.testACL());
        }

        const datasiteBtn = document.getElementById('datasite-btn');
        if (datasiteBtn) {
            datasiteBtn.addEventListener('click', () => this.testDatasite());
        }

        const listBtn = document.getElementById('list-btn');
        if (listBtn) {
            listBtn.addEventListener('click', () => this.listFiles());
        }

        // Enter key handlers
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.requestOTP();
            });
        }

        const otpInput = document.getElementById('otp');
        if (otpInput) {
            otpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.verifyOTP();
            });
        }
    }

    initializeLogging() {
        // Clear log button is handled inline in HTML
        console.log('Logging system initialized');
    }

    log(message, type = 'info') {
        const logDiv = document.getElementById('console-log');
        if (!logDiv) return;

        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            info: '#00ff41',
            success: '#00aa41', 
            error: '#ff0040',
            warning: '#ffaa00',
            critical: '#ff4081'
        };
        
        const color = colors[type] || colors.info;
        const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'critical' ? '🔥' : '📋';
        
        const logEntry = {
            timestamp,
            message,
            type,
            color,
            emoji
        };
        
        this.logEntries.push(logEntry);
        
        // Update display
        logDiv.innerHTML += `<span style="color: ${color}">[${timestamp}] ${emoji} ${message}</span>\n`;
        logDiv.scrollTop = logDiv.scrollHeight;
        
        // Also log to console
        console.log(`[SDK-TEST] ${message}`);
    }

    clearLog() {
        const logDiv = document.getElementById('console-log');
        if (logDiv) {
            logDiv.innerHTML = '';
        }
        this.logEntries = [];
        this.log('Log cleared', 'info');
    }

    async initializeClient() {
        try {
            const initBtn = document.getElementById('init-btn');
            const statusDiv = document.getElementById('init-status');
            
            if (initBtn) initBtn.disabled = true;
            this.log('🚀 Initializing SyftBox client...', 'info');
            
            // Check if SyftBoxClient is available
            if (typeof SyftBoxClient === 'undefined') {
                throw new Error('SyftBoxClient not found! Bundle may not be loaded.');
            }
            
            // Determine the proxy base URL based on current location
            const proxyBaseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
            
            // Use the createSyftBoxClient factory function
            this.client = SyftBoxClient.createSyftBoxClient({
                serverUrl: 'https://syftbox.net',
                logging: { 
                    enabled: true, 
                    level: 'debug' 
                },
                proxy: {
                    baseUrl: proxyBaseUrl
                },
                websocket: {
                    reconnectAttempts: 5,
                    reconnectDelay: 2000
                }
            });
            
            this.log(`Client initialized with server: https://syftbox.net`, 'info');
            this.log(`Proxy configured for: ${proxyBaseUrl}`, 'info');
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">✅ Client initialized</span>';
            }
            this.log('✅ SyftBox client created and ready', 'success');
            
            // Enable OTP request
            const otpRequestBtn = document.getElementById('otp-request-btn');
            if (otpRequestBtn) {
                otpRequestBtn.disabled = false;
            }
            
        } catch (error) {
            const statusDiv = document.getElementById('init-status');
            const initBtn = document.getElementById('init-btn');
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Failed to initialize</span>';
            }
            this.log(`❌ Client initialization failed: ${error.message}`, 'error');
            if (initBtn) initBtn.disabled = false;
        }
    }

    async requestOTP() {
        if (!this.client) {
            const statusDiv = document.getElementById('otp-request-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Initialize client first</span>';
            }
            return;
        }
        
        const emailInput = document.getElementById('email');
        const email = emailInput ? emailInput.value.trim() : '';
        
        if (!email || !email.includes('@')) {
            const statusDiv = document.getElementById('otp-request-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Enter valid email</span>';
            }
            return;
        }
        
        try {
            const otpRequestBtn = document.getElementById('otp-request-btn');
            const statusDiv = document.getElementById('otp-request-status');
            
            if (otpRequestBtn) otpRequestBtn.disabled = true;
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="warning">⏳ Sending OTP...</span>';
            }
            this.log(`📧 Requesting OTP for: ${email}`, 'info');
            
            await this.client.auth.requestOTP(email);
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">✅ OTP sent! Check your email</span>';
            }
            this.log('✅ OTP request successful! Check your email', 'success');
            
            // Enable OTP verification
            const otpVerifyBtn = document.getElementById('otp-verify-btn');
            const otpInput = document.getElementById('otp');
            if (otpVerifyBtn) otpVerifyBtn.disabled = false;
            if (otpInput) otpInput.focus();
            
        } catch (error) {
            const statusDiv = document.getElementById('otp-request-status');
            const otpRequestBtn = document.getElementById('otp-request-btn');
            
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="error">❌ OTP failed: ${error.message}</span>`;
            }
            this.log(`❌ OTP request error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`Error code: ${error.code}`, 'error');
            }
            if (otpRequestBtn) otpRequestBtn.disabled = false;
        }
    }

    async verifyOTP() {
        if (!this.client) {
            const statusDiv = document.getElementById('auth-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Initialize client first</span>';
            }
            return;
        }
        
        const emailInput = document.getElementById('email');
        const otpInput = document.getElementById('otp');
        const email = emailInput ? emailInput.value.trim() : '';
        const otp = otpInput ? otpInput.value.trim() : '';
        
        if (!email) {
            const statusDiv = document.getElementById('auth-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Enter email first</span>';
            }
            return;
        }
        
        if (!otp || otp.length !== 8) {
            const statusDiv = document.getElementById('auth-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Enter 8-digit OTP code</span>';
            }
            return;
        }
        
        try {
            const otpVerifyBtn = document.getElementById('otp-verify-btn');
            const statusDiv = document.getElementById('auth-status');
            
            if (otpVerifyBtn) otpVerifyBtn.disabled = true;
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="warning">⏳ Verifying OTP...</span>';
            }
            this.log(`🔐 Verifying OTP code: ${otp}`, 'info');
            
            const tokens = await this.client.auth.verifyOTP(email, otp);
            
            this.isAuthenticated = true;
            this.currentUser = this.client.getCurrentUser() || email;
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">✅ Authentication successful!</span>';
            }
            this.log('✅ Authentication successful! Ready for testing', 'success');
            this.log(`🎟️ Access token received (${tokens.accessToken.length} chars)`, 'info');
            this.log(`👤 Current user: ${this.currentUser}`, 'info');
            
            // Enable test buttons
            this.enableTestButtons();
            
        } catch (error) {
            const statusDiv = document.getElementById('auth-status');
            const otpVerifyBtn = document.getElementById('otp-verify-btn');
            
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="error">❌ OTP verification failed: ${error.message}</span>`;
            }
            this.log(`❌ OTP verification error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`Error code: ${error.code}`, 'error');
            }
            if (otpVerifyBtn) otpVerifyBtn.disabled = false;
        }
    }

    enableTestButtons() {
        const buttons = ['test-btn', 'download-test-btn', 'websocket-btn', 'acl-btn', 'datasite-btn', 'list-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });
    }

    async testUpload() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        const testKey = `${this.currentUser}/public/test-${Date.now()}.txt`;
        // Build content without self-reference
        const timestamp = new Date().toISOString();
        const testContent = `🚀 SyftBox API SDK Test File
Timestamp: ${timestamp}
User: ${this.currentUser}
SDK Version: @syftbox/api-sdk v1.0.0

This file was uploaded using the new TypeScript SDK.

Test Details:
- Upload method: client.blob.upload()
- Key format: ${testKey}
- Content type: text/plain

If you can read this file, the upload worked! 🎉`;

        try {
            const statusDiv = document.getElementById('test-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="warning">⏳ Uploading file...</span>';
            }
            
            this.log('🚀 STARTING FILE UPLOAD TEST', 'critical');
            this.log(`📤 Target: ${testKey}`, 'info');
            
            const blob = new Blob([testContent], { type: 'text/plain' });
            this.log(`📝 Content size: ${blob.size} bytes`, 'info');
            
            const startTime = Date.now();
            const result = await this.client.blob.upload(testKey, blob);
            const endTime = Date.now();
            
            this.log(`🎉 Upload successful! Completed in ${endTime - startTime}ms`, 'success');
            this.log(`📊 Result details:`, 'success');
            this.log(`  • Key: ${result.key}`, 'info');
            this.log(`  • Size: ${result.size} bytes`, 'info');
            this.log(`  • Version: ${result.version}`, 'info');
            this.log(`  • ETag: ${result.etag}`, 'info');
            this.log(`  • Last Modified: ${result.lastModified}`, 'info');
            
            // Save the uploaded file key for download test
            this.lastUploadedFile = testKey;
            this.log(`💾 Saved file key for download test: ${testKey}`, 'info');
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">🎉 Upload successful!</span>';
            }
            
            // Verify file exists
            setTimeout(async () => {
                try {
                    this.log('🔍 Verifying uploaded file exists...', 'info');
                    const exists = await this.client.blob.exists(testKey);
                    if (exists) {
                        this.log('✅ File confirmed in blob storage!', 'success');
                    } else {
                        this.log('⚠️ File not found in list (may be propagation delay)', 'warning');
                    }
                } catch (e) {
                    this.log(`⚠️ Verification check failed: ${e.message}`, 'warning');
                }
            }, 2000);
            
        } catch (error) {
            const statusDiv = document.getElementById('test-status');
            
            this.log(`❌ Upload failed: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Upload failed - check logs</span>';
            }
        }
    }

    async testDownload() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        // Use the last uploaded file if available, otherwise try a default
        let targetFile = this.lastUploadedFile;
        
        if (!targetFile) {
            this.log('⚠️ No file uploaded yet. Uploading a test file first...', 'warning');
            
            // Upload a test file first
            const testKey = `${this.currentUser}/public/download-test-${Date.now()}.txt`;
            const testContent = 'This is a test file for download testing.';
            
            try {
                const blob = new Blob([testContent], { type: 'text/plain' });
                await this.client.blob.upload(testKey, blob);
                targetFile = testKey;
                this.log(`✅ Uploaded test file: ${testKey}`, 'success');
            } catch (uploadError) {
                this.log(`❌ Failed to upload test file: ${uploadError.message}`, 'error');
                return;
            }
        }
        
        try {
            const statusDiv = document.getElementById('download-test-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="warning">⏳ Testing download...</span>';
            }
            
            this.log('🚀 TESTING FILE DOWNLOAD', 'critical');
            this.log(`📥 Target: ${targetFile}`, 'info');
            
            const startTime = Date.now();
            const fileData = await this.client.blob.downloadFile(targetFile);
            const endTime = Date.now();
            
            // Success handling
            const textContent = new TextDecoder('utf-8').decode(fileData);
            this.log(`🎉 Download successful! ${fileData.byteLength} bytes in ${endTime - startTime}ms`, 'success');
            this.log(`📄 Content preview (first 200 chars):`, 'info');
            this.log(`"${textContent.substring(0, 200)}..."`, 'info');
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">🎉 Download successful!</span>';
            }
            
        } catch (error) {
            const statusDiv = document.getElementById('download-test-status');
            
            this.log(`❌ Download error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
            
            if (error.message.includes('proxy') || error.message.includes('8000')) {
                this.log('⚠️ Proxy server may not be running on port 8000', 'warning');
                this.log('💡 Make sure the proxy server is running', 'info');
            } else if (error.code === 'INVALID_REQUEST' && error.message.includes('400')) {
                this.log('📝 The file may not exist. Try uploading a file first.', 'warning');
                this.log('💡 Click "Test File Upload" before testing download', 'info');
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Download failed - check logs</span>';
            }
        }
    }

    async testWebSocket() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        try {
            const statusDiv = document.getElementById('websocket-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="warning">⏳ Connecting to WebSocket...</span>';
            }
            
            this.log('🔌 TESTING WEBSOCKET CONNECTION', 'critical');
            
            // Set up event listeners
            this.client.websocket.addEventListener('connected', () => {
                this.log('✅ WebSocket connected!', 'success');
                if (statusDiv) {
                    statusDiv.innerHTML = '<span class="success">✅ WebSocket connected!</span>';
                }
            });
            
            this.client.websocket.addEventListener('disconnected', (event) => {
                this.log(`⚠️ WebSocket disconnected: ${event.detail?.reason || 'Unknown reason'}`, 'warning');
            });
            
            this.client.websocket.addEventListener('message', (event) => {
                this.log(`📨 WebSocket message received: ${JSON.stringify(event.detail)}`, 'info');
            });
            
            this.client.websocket.addEventListener('error', (event) => {
                this.log(`❌ WebSocket error: ${event.detail?.message || 'Unknown error'}`, 'error');
            });
            
            // Connect
            await this.client.websocket.connect();
            
            // Send a test message after connection
            setTimeout(() => {
                if (this.client.websocket.isConnected()) {
                    const testMessage = {
                        id: `test-${Date.now()}`,
                        typ: 0, // System message
                        dat: { test: 'Hello from browser!' }
                    };
                    this.client.websocket.send(testMessage);
                    this.log(`📤 Sent test message: ${JSON.stringify(testMessage)}`, 'info');
                }
            }, 1000);
            
        } catch (error) {
            const statusDiv = document.getElementById('websocket-status');
            
            this.log(`❌ WebSocket error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ WebSocket failed - check logs</span>';
            }
        }
    }

    async testACL() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        try {
            const statusDiv = document.getElementById('services-status');
            this.log('🔐 TESTING ACL SERVICE', 'critical');
            
            const checkRequest = {
                user: this.currentUser,
                path: `${this.currentUser}/public/test.txt`,
                level: 1, // READ access
                size: 1024
            };
            
            this.log(`🔍 Checking access for: ${checkRequest.path}`, 'info');
            this.log(`👤 User: ${checkRequest.user}`, 'info');
            this.log(`🔑 Level: READ (1)`, 'info');
            
            const hasAccess = await this.client.acl.check(checkRequest);
            
            if (hasAccess) {
                this.log('✅ Access granted!', 'success');
                if (statusDiv) {
                    statusDiv.innerHTML = '<span class="success">✅ ACL check passed!</span>';
                }
            } else {
                this.log('🚫 Access denied', 'warning');
                if (statusDiv) {
                    statusDiv.innerHTML = '<span class="warning">🚫 ACL check: Access denied</span>';
                }
            }
            
        } catch (error) {
            this.log(`❌ ACL error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
        }
    }

    async testDatasite() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        try {
            const statusDiv = document.getElementById('services-status');
            this.log('📊 TESTING DATASITE SERVICE', 'critical');
            
            const path = '/public';
            this.log(`🔍 Viewing datasite: ${this.currentUser}${path}`, 'info');
            
            const view = await this.client.datasite.view(this.currentUser, path);
            
            this.log(`✅ Datasite view received!`, 'success');
            this.log(`📁 Files found: ${view.files?.length || 0}`, 'info');
            
            if (view.files && view.files.length > 0) {
                this.log('📋 File list:', 'info');
                view.files.slice(0, 5).forEach(file => {
                    this.log(`  • ${file.key} (${file.size} bytes)`, 'info');
                });
                if (view.files.length > 5) {
                    this.log(`  ... and ${view.files.length - 5} more`, 'info');
                }
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="success">✅ Datasite: ${view.files?.length || 0} files</span>`;
            }
            
        } catch (error) {
            this.log(`❌ Datasite error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
        }
    }

    async listFiles() {
        if (!this.client || !this.isAuthenticated) {
            this.log('❌ Not authenticated', 'error');
            return;
        }

        try {
            const statusDiv = document.getElementById('services-status');
            this.log('📋 LISTING UPLOADED FILES', 'critical');
            
            const list = await this.client.blob.list();
            
            this.log(`✅ Found ${list.blobs?.length || 0} files`, 'success');
            
            if (list.blobs && list.blobs.length > 0) {
                this.log('📁 Your files:', 'info');
                list.blobs.forEach((blob, index) => {
                    this.log(`  ${index + 1}. ${blob.key}`, 'info');
                    this.log(`     Size: ${blob.size} bytes`, 'info');
                    this.log(`     Modified: ${new Date(blob.lastModified).toLocaleString()}`, 'info');
                });
            } else {
                this.log('📭 No files found', 'warning');
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="success">✅ Listed ${list.blobs?.length || 0} files</span>`;
            }
            
        } catch (error) {
            this.log(`❌ List error: ${error.message}`, 'error');
            if (error.code) {
                this.log(`🔍 Error code: ${error.code}`, 'error');
            }
        }
    }

    showDebugInfo() {
        this.log('🔧 DEBUG INFORMATION', 'critical');
        this.log(`Client initialized: ${!!this.client}`, 'info');
        this.log(`Authenticated: ${this.isAuthenticated}`, 'info');
        this.log(`Current user: ${this.currentUser || 'None'}`, 'info');
        
        if (this.client) {
            this.log(`Client ready: ${this.client.isReady()}`, 'info');
            this.log(`WebSocket connected: ${this.client.websocket?.isConnected() || false}`, 'info');
        }
        
        this.log(`SyftBoxClient available: ${typeof SyftBoxClient !== 'undefined'}`, 'info');
        if (typeof SyftBoxClient !== 'undefined') {
            this.log(`Available exports: ${Object.keys(SyftBoxClient).join(', ')}`, 'info');
        }
    }

    // Public API methods
    getLogEntries() {
        return [...this.logEntries];
    }

    exportLogs() {
        const exportData = {
            timestamp: new Date().toISOString(),
            testSession: {
                authenticated: this.isAuthenticated,
                user: this.currentUser,
                clientInitialized: !!this.client
            },
            logs: this.logEntries
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `syftbox-sdk-test-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.log('📊 Test logs exported successfully', 'success');
    }
}

// Export for global access
window.TestingApp = TestingApp;