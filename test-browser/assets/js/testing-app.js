/**
 * Testing Application Module - SyftBox API SDK Testing Interface
 * 
 * This module provides testing functionality for:
 * - Client initialization and authentication
 * - File upload/download testing
 * - Datasite services and path filtering
 */

class TestingApp {
    constructor() {
        this.client = null;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.lastUploadedFile = null; // Track the last uploaded file for download test
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            console.log('✅ Testing application initialized');
            
            // Auto-initialize the client
            await this.initializeClient();
        } catch (error) {
            console.error('❌ Failed to initialize testing app:', error);
        }
    }

    setupEventListeners() {
        // Initialize client button (removed - auto-initializes)

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

        // File upload test button
        const testBtn = document.getElementById('test-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testUpload());
        }

        // File download test button
        const downloadTestBtn = document.getElementById('download-test-btn');
        if (downloadTestBtn) {
            downloadTestBtn.addEventListener('click', () => this.testDownload());
        }

        const datasiteBtn = document.getElementById('datasite-btn');
        if (datasiteBtn) {
            datasiteBtn.addEventListener('click', () => this.testDatasite());
        }

        const pathViewBtn = document.getElementById('path-view-btn');
        if (pathViewBtn) {
            pathViewBtn.addEventListener('click', () => this.testPathView());
        }

        // Enter key handlers
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.requestOTP();
                }
            });
        }

        const otpInput = document.getElementById('otp');
        if (otpInput) {
            otpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.verifyOTP();
                }
            });
        }

        const pathInput = document.getElementById('path-input');
        if (pathInput) {
            pathInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.testPathView();
                }
            });
        }
    }

    async initializeClient() {
        try {
            const statusDiv = document.getElementById('init-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Initializing client...</div>';
            }

            console.log('🚀 Initializing SyftBox client...');

            this.client = SyftBoxClient.createSyftBoxClient({
                serverUrl: 'https://syftbox.net',
                logging: {
                    enabled: true,
                    level: 'debug'
                },
                datasite: {
                    refreshIntervalMs: 10000,
                    autoRefresh: true
                }
            });

            console.log('✅ Client initialized successfully');

            // Enable OTP request
            const otpRequestBtn = document.getElementById('otp-request-btn');
            if (otpRequestBtn) otpRequestBtn.disabled = false;

        } catch (error) {
            console.error('❌ Client initialization failed:', error);

            const statusDiv = document.getElementById('init-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ Initialization failed</div>';
            }
        }
    }

    async requestOTP() {
        if (!this.client) {
            console.error('❌ Client not initialized');
            return;
        }

        const emailInput = document.getElementById('email');
        const email = emailInput ? emailInput.value.trim() : '';

        if (!email) {
            console.error('❌ Please enter an email');
            return;
        }

        try {
            const statusDiv = document.getElementById('otp-request-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Requesting OTP...</div>';
            }

            console.log(`📧 Requesting OTP for: ${email}`);
            
            await this.client.auth.requestOTP(email);

            console.log('✅ OTP request successful! Check your email.');

            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-success">✅ OTP sent! Check your email.</div>';
            }

            // Enable OTP verification
            const otpVerifyBtn = document.getElementById('otp-verify-btn');
            if (otpVerifyBtn) otpVerifyBtn.disabled = false;

        } catch (error) {
            console.error(`❌ OTP request failed: ${error.message}`);

            const statusDiv = document.getElementById('otp-request-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ OTP request failed</div>';
            }
        }
    }

    async verifyOTP() {
        if (!this.client) {
            console.error('❌ Client not initialized');
            return;
        }

        const emailInput = document.getElementById('email');
        const otpInput = document.getElementById('otp');
        const email = emailInput ? emailInput.value.trim() : '';
        const otp = otpInput ? otpInput.value.trim() : '';

        if (!email || !otp) {
            console.error('❌ Please enter both email and OTP');
            return;
        }

        try {
            const statusDiv = document.getElementById('auth-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Verifying OTP...</div>';
            }

            console.log(`🔐 Verifying OTP for: ${email}`);
            
            const tokens = await this.client.auth.verifyOTP(email, otp);

            this.isAuthenticated = true;
            this.currentUser = this.client.getCurrentUser() || email;

            console.log('✅ Authentication successful!');
            console.log(`👤 Current user: ${this.currentUser}`);

            if (statusDiv) {
                statusDiv.innerHTML = `<div class="status status-success">✅ Authenticated as: ${this.currentUser}</div>`;
            }

            this.enableTestButtons();

        } catch (error) {
            console.error(`❌ OTP verification failed: ${error.message}`);

            const statusDiv = document.getElementById('auth-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ Authentication failed</div>';
            }

            // Keep OTP verify button enabled for retry
            const otpVerifyBtn = document.getElementById('otp-verify-btn');
            if (otpVerifyBtn) otpVerifyBtn.disabled = false;
        }
    }

    enableTestButtons() {
        const buttons = ['test-btn', 'download-test-btn', 'datasite-btn', 'path-view-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });
    }

    async testUpload() {
        if (!this.client || !this.isAuthenticated) {
            console.error('❌ Not authenticated');
            return;
        }

        try {
            const statusDiv = document.getElementById('upload-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Testing upload...</div>';
            }
            
            console.log('📤 TESTING FILE UPLOAD');
            
            // Create a test file
            const testContent = `Hello from SyftBox SDK!\nTimestamp: ${new Date().toISOString()}\nUser: ${this.currentUser}`;
            const testFile = new File([testContent], 'test-upload.txt', { type: 'text/plain' });
            const testPath = `${this.currentUser}/public/test-upload-${Date.now()}.txt`;
            
            console.log(`📁 Uploading to: ${testPath}`);
            console.log(`📊 File size: ${testFile.size} bytes`);
            
            const result = await this.client.blob.upload(testPath, testFile);
            
            console.log(`✅ Upload successful!`);
            console.log(`📊 Upload result:`, result);
            
            // Store for download test
            this.lastUploadedFile = {
                path: testPath,
                name: testFile.name,
                size: testFile.size,
                result: result
            };
            
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="status status-success">✅ Upload successful: ${testPath}</div>`;
            }
            
        } catch (error) {
            console.error(`❌ Upload error: ${error.message}`);
            if (error.code) {
                console.error(`🔍 Error code: ${error.code}`);
            }
            
            const statusDiv = document.getElementById('upload-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ Upload failed - check console</div>';
            }
        }
    }

    async testDownload() {
        if (!this.client || !this.isAuthenticated) {
            console.error('❌ Not authenticated');
            return;
        }

        if (!this.lastUploadedFile) {
            console.error('❌ No file uploaded yet. Please upload a file first.');
            return;
        }

        try {
            const statusDiv = document.getElementById('download-test-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Testing download...</div>';
            }

            console.log('📥 TESTING FILE DOWNLOAD');
            console.log(`📁 Downloading: ${this.lastUploadedFile.path}`);

            const fileData = await this.client.blob.downloadFile(this.lastUploadedFile.path);
            
            // Decode binary data to text
            const textContent = new TextDecoder('utf-8').decode(fileData);

            console.log(`✅ Download successful!`);
            console.log(`📊 Downloaded ${fileData.byteLength} bytes`);
            console.log(`📄 Content preview: ${textContent.substring(0, 100)}...`);

            if (statusDiv) {
                statusDiv.innerHTML = `<div class="status status-success">✅ Downloaded ${fileData.byteLength} bytes from ${this.lastUploadedFile.name}</div>`;
            }

        } catch (error) {
            console.error(`❌ Download error: ${error.message}`);
            if (error.code) {
                console.error(`🔍 Error code: ${error.code}`);
            }

            const statusDiv = document.getElementById('download-test-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ Download failed - check console</div>';
            }
        }
    }

    async testDatasite() {
        if (!this.client || !this.isAuthenticated) {
            console.error('❌ Not authenticated');
            return;
        }

        try {
            const statusDiv = document.getElementById('services-status');
            console.log('📊 TESTING DATASITE SERVICE');
            
            console.log(`🔍 Getting datasite view for current user`);
            
            // The getView() method doesn't take parameters - it returns files for the authenticated user
            const files = await this.client.datasite.getView();
            
            console.log(`✅ Datasite view received!`);
            console.log(`📁 Files found: ${files?.length || 0}`);
            
            // Check cache status
            const cacheStatus = this.client.datasite.getCacheStatus();
            console.log(`🗄️ Cache status: ${cacheStatus.cached ? 'Cached' : 'Not cached'}`);
            if (cacheStatus.lastFetch) {
                console.log(`⏰ Last fetch: ${cacheStatus.lastFetch.toLocaleString()}`);
            }
            
            if (files && files.length > 0) {
                console.log('📋 File list:');
                
                files.slice(0, 5).forEach((file, index) => {
                    console.log(`  ${index + 1}. ${file.key} (${file.size} bytes)`);
                    if (file.lastModified) {
                        console.log(`     Modified: ${new Date(file.lastModified).toLocaleString()}`);
                    }
                });
                if (files.length > 5) {
                    console.log(`  ... and ${files.length - 5} more files`);
                }
                
                // Test the new getPathView method
                console.log('🔬 Testing path filtering...');
                
                // Extract unique path prefixes from the files
                const pathPrefixes = new Set();
                files.forEach(file => {
                    const parts = file.key.split('/');
                    if (parts.length > 1) {
                        pathPrefixes.add(parts[0] + '/');
                    }
                });
                
                if (pathPrefixes.size > 0) {
                    const testPath = Array.from(pathPrefixes)[0];
                    console.log(`🔍 Testing getPathView('${testPath}')`);
                    
                    const filteredFiles = await this.client.datasite.getPathView(testPath);
                    console.log(`✅ Found ${filteredFiles.length} files matching path '${testPath}'`);
                    
                    if (filteredFiles.length > 0) {
                        console.log('📁 Filtered results (first 3):');
                        filteredFiles.slice(0, 3).forEach((file, index) => {
                            console.log(`  ${index + 1}. ${file.key}`);
                        });
                    }
                } else {
                    console.log('⚠️ No path prefixes found for filtering test');
                }
                
                // Test auto-refresh behavior
                console.log('⏳ Cache will auto-refresh every 10 seconds');
                
            } else {
                console.log('📭 No files in datasite view');
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="status status-success">✅ Datasite: ${files?.length || 0} files (cached)</div>`;
            }
            
        } catch (error) {
            console.error(`❌ Datasite error: ${error.message}`);
            if (error.code) {
                console.error(`🔍 Error code: ${error.code}`);
            }
        }
    }

    async testPathView() {
        if (!this.client || !this.isAuthenticated) {
            console.error('❌ Not authenticated');
            return;
        }

        const pathInput = document.getElementById('path-input');
        const path = pathInput ? pathInput.value.trim() : 'public/';
        
        if (!path) {
            console.error('❌ Please enter a path');
            return;
        }

        try {
            const statusDiv = document.getElementById('path-view-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-info">⏳ Getting filtered path view...</div>';
            }
            
            console.log('🌳 TESTING PATH VIEW (Filtered)');
            console.log(`🔍 Filter path: ${path}`);
            
            // Normalize the path for our getPathView method
            const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
            
            // Call the new getPathView method (uses cached data)
            const files = await this.client.datasite.getPathView(normalizedPath);
            
            // Check cache status
            const cacheStatus = this.client.datasite.getCacheStatus();
            console.log(`🗄️ Using cached data (Last fetch: ${cacheStatus.lastFetch ? cacheStatus.lastFetch.toLocaleString() : 'Never'})`);
            
            console.log(`✅ Filtered view received!`);
            console.log(`📊 Files matching '${normalizedPath}': ${files?.length || 0}`);
            
            if (files && files.length > 0) {
                console.log('🗂️ File Paths:');
                
                // Sort files by key for consistent display
                const sortedFiles = files.sort((a, b) => a.key.localeCompare(b.key));
                
                // Display file paths in HTML
                this.renderFilePathsList(sortedFiles, normalizedPath);
                
                // Also log to console for debugging
                sortedFiles.forEach((file, index) => {
                    const sizeStr = this.formatFileSize(file.size);
                    const dateStr = file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown';
                    
                    console.log(`  ${index + 1}. ${file.key}`);
                    console.log(`     Size: ${sizeStr} | Modified: ${dateStr}`);
                });
                
                // Show summary
                const totalSize = files.reduce((sum, f) => sum + f.size, 0);
                console.log('📊 Summary:');
                console.log(`  • Total files: ${files.length}`);
                console.log(`  • Total size: ${this.formatFileSize(totalSize)}`);
                
            } else {
                console.log(`📭 No files found matching path: ${normalizedPath}`);
                console.log('💡 Try paths like: public/, user/, data/');
                
                // Hide the file paths container
                const container = document.getElementById('file-paths-container');
                if (container) {
                    container.style.display = 'none';
                }
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="status status-success">✅ Found ${files?.length || 0} files matching path: ${normalizedPath}</div>`;
            }
            
        } catch (error) {
            const statusDiv = document.getElementById('path-view-status');
            
            console.error(`❌ Path view error: ${error.message}`);
            if (error.code) {
                console.error(`🔍 Error code: ${error.code}`);
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="status status-error">❌ Path view failed - check console</div>';
            }
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    renderFilePathsList(files, filterPath) {
        const container = document.getElementById('file-paths-container');
        const titleEl = document.getElementById('files-title');
        const listDiv = document.getElementById('file-paths-list');
        const summaryDiv = document.getElementById('file-summary');
        
        if (!container || !listDiv || !summaryDiv) return;
        
        // Show the container with fade-in animation
        container.style.display = 'block';
        container.classList.add('fade-in');
        
        // Update title
        if (titleEl) {
            titleEl.textContent = `Files matching "${filterPath}"`;
        }
        
        // Clear previous content
        listDiv.innerHTML = '';
        
        if (files.length === 0) {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <span class="emoji">📭</span>
                    <p>No files found matching this path</p>
                    <p style="font-size: 0.75rem; margin-top: 8px;">Try paths like: public/, user/, data/</p>
                </div>
            `;
            summaryDiv.innerHTML = '';
            return;
        }
        
        let totalSize = 0;
        
        files.forEach((file, index) => {
            const sizeStr = this.formatFileSize(file.size);
            const dateStr = file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Unknown';
            totalSize += file.size;
            
            // Determine file icon based on extension
            const ext = file.key.split('.').pop().toLowerCase();
            let icon = '📄';
            if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) icon = '🖼️';
            else if (['js', 'ts', 'py', 'java', 'c', 'cpp'].includes(ext)) icon = '📝';
            else if (['json', 'xml', 'yaml', 'yml'].includes(ext)) icon = '📋';
            else if (['zip', 'tar', 'gz', 'rar'].includes(ext)) icon = '📦';
            else if (['pdf'].includes(ext)) icon = '📕';
            else if (['md', 'txt'].includes(ext)) icon = '📃';
            else if (['css'].includes(ext)) icon = '🎨';
            else if (['html', 'htm'].includes(ext)) icon = '🌐';
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-icon">${icon}</span>
                <div class="file-details">
                    <div class="file-path">${file.key}</div>
                    <div class="file-meta">Size: ${sizeStr} • Modified: ${dateStr}</div>
                </div>
            `;
            
            listDiv.appendChild(fileItem);
        });
        
        // Update summary
        const cacheStatus = this.client.datasite.getCacheStatus();
        summaryDiv.innerHTML = `
            <strong>Total:</strong> ${files.length} files • 
            <strong>Size:</strong> ${this.formatFileSize(totalSize)} • 
            <strong>Cache updated:</strong> ${cacheStatus.lastFetch ? cacheStatus.lastFetch.toLocaleString() : 'Never'}
        `;
    }
}

// Initialize the testing application when the script loads
window.TestingApp = TestingApp;